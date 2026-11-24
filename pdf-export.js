import {
  PDFDocument, PDFHexString, PDFName, StandardFonts, rgb,
  beginText, endText, setFontAndSize, setTextMatrix, setTextRenderingMode, showText,
} from './assets/pdf-lib.js';

// Only the rendered preview enters this module. The snapshot does not retain DOM nodes.
function snapshot(article) {
  if (!article?.matches('article#print-report')) throw new Error('Open a report preview first.');
  const blocks = [];
  const exclude = '[hidden], [aria-hidden="true"], .jr-sr, button, script, style';
  const visibleText = el => el.innerText.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').trim();
  function cellText(cell) {
    if (!cell.querySelector('.jr-detail')) return visibleText(cell);
    // WebKit drops whitespace between inline-block detail groups in innerText.
    return Array.from(cell.childNodes, node => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType !== Node.ELEMENT_NODE || node.matches(exclude) || getComputedStyle(node).display === 'none') return '';
      if (node.matches('br')) return '\n';
      return (node.matches('.jr-detail') ? '\n' : '') + visibleText(node);
    }).join('').replace(/[ \t]+\n/g, '\n').trim();
  }
  function visit(el) {
    if (el.matches(exclude) || getComputedStyle(el).display === 'none') return;
    if (el.matches('table')) {
      const readRow = row => Array.from(row.cells, cellText);
      blocks.push({ kind: 'table', header: readRow(el.tHead.rows[0]), rows: Array.from(el.tBodies).flatMap(body => Array.from(body.rows, readRow)) });
    } else if (el.matches('.jr-report-section') && el.querySelector(':scope > h4')) {
      // Each saved form has one heading followed by its answer paragraphs.
      let form;
      for (const child of el.children) {
        if (child.matches(exclude) || getComputedStyle(child).display === 'none') continue;
        if (child.matches('h4')) {
          form = {kind: 'form', heading: visibleText(child), answers: []};
          blocks.push(form);
        } else if (form && child.matches('p')) form.answers.push(visibleText(child));
        else { form = null; visit(child); }
      }
    } else if (el.matches('.jr-stats')) {
      const cards = Array.from(el.querySelectorAll('.jr-stat'), card => Array.from(card.children, visibleText));
      blocks.push({kind: 'table', header: cards.map(card => card[0]), rows: [cards.map(card => card.slice(1).join('\n'))]});
    } else if (el.matches('h2, h3, h4, p, li, .jr-report-head > span') || !el.children.length) {
      const text = visibleText(el);
      if (text) blocks.push({kind: el.tagName.toLowerCase(), text});
    } else {
      for (const child of el.children) visit(child);
    }
  }
  visit(article);
  return blocks;
}

const paper = [612, 792];
const margin = 40;
const width = paper[0] - 2 * margin;
const bottom = paper[1] - 52;
const green = rgb(.20, .32, .25);
const ink = rgb(.13, .17, .15);
const hairline = rgb(.79, .83, .79);
const tint = rgb(.93, .95, .92);
const headerTint = rgb(.88, .92, .87);
const tableSize = 9.5;
const tableLeading = 14;
const padding = 5;

// Both measurement and drawing use the same font. The standard PDF fonts stay
// searchable; other scripts are shaped by the device with its own fallback fonts.
function createTypesetter(regular, bold) {
  const glyphs = new Map(regular.getCharacterSet().map(code => {
    const char = String.fromCodePoint(code);
    return [char, [regular.widthOfTextAtSize(char, 1), bold.widthOfTextAtSize(char, 1)]];
  }));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Text rendering is unavailable.');
  const font = (size, strong) => `${strong ? 'bold' : 'normal'} ${size}px Arial, sans-serif`;
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, {granularity: 'grapheme'}) : null;
  function measure(text, size, strong) {
    let units = 0;
    for (const char of text) {
      const widths = glyphs.get(char);
      if (!widths) {
        ctx.font = font(size, strong);
        return ctx.measureText(text).width;
      }
      units += widths[strong ? 1 : 0];
    }
    return units * size;
  }
  function wrap(text, limit, size, strong) {
    const lines = [];
    for (const paragraph of text.split('\n')) {
      let line = '';
      let space = '';
      for (const [token] of paragraph.matchAll(/\s+|\S+/gu)) {
        if (/^\s/u.test(token)) { space = token; continue; }
        // Bound measurement time even for a very long pasted URL or a script
        // that doesn't separate words with spaces.
        if (token.length < 512 && measure(line + space + token, size, strong) <= limit) {
          line += space + token;
        } else {
          if (line) lines.push(line);
          line = '';
          if (token.length < 512 && measure(token, size, strong) <= limit) {
            line = token;
          } else {
            const chars = segmenter ? segmenter.segment(token) : token;
            for (const part of chars) {
              const char = segmenter ? part.segment : part;
              if (line && measure(line + char, size, strong) > limit) {
                lines.push(line);
                line = '';
              }
              line += char;
            }
          }
        }
        space = '';
      }
      lines.push(line);
    }
    return lines;
  }
  const nativeText = text => Array.from(text).every(char => glyphs.has(char));
  async function draw(doc, page, searchLayer, text, x, top, size, strong, color, limit) {
    if (!text) return;
    const y = paper[1] - top - size;
    if (nativeText(text)) {
      page.drawText(text, {x, y, size, font: strong ? bold : regular, color});
      return;
    }
    // Rasterize just this line, never an entire report or a tall scrolling page.
    // Position the image on the same baseline as the surrounding vector text.
    ctx.font = font(size, strong);
    ctx.direction = 'ltr';
    const metrics = ctx.measureText(text);
    const left = Math.max(0, metrics.actualBoundingBoxLeft || 0) + 1;
    const ascent = Math.ceil(Math.max(size, metrics.actualBoundingBoxAscent || size)) + 1;
    const descent = Math.ceil(Math.max(size * .3, metrics.actualBoundingBoxDescent || 0)) + 1;
    const naturalWidth = Math.max(metrics.width, metrics.actualBoundingBoxRight || 0);
    const drawWidth = Math.max(1, Math.min(limit, naturalWidth));
    const scale = 3;
    canvas.width = Math.ceil((left + drawWidth + 1) * scale);
    canvas.height = Math.ceil((ascent + descent) * scale);
    ctx.scale(scale, scale);
    ctx.font = font(size, strong);
    ctx.direction = 'ltr';
    ctx.fillStyle = `rgb(${[color.red, color.green, color.blue].map(n => Math.round(n * 255)).join(',')})`;
    ctx.fillText(text, left, ascent, drawWidth);
    const image = await doc.embedPng(canvas.toDataURL('image/png'));
    // Release decoded pixels per line instead of retaining them until save().
    await image.embed();
    page.drawImage(image, {x: x - left, y: y + ascent - canvas.height / scale, width: canvas.width / scale, height: canvas.height / scale});
    searchLayer(page, text, x, y, size, drawWidth);
    canvas.width = canvas.height = 1;
  }
  return {measure, wrap, draw, nativeText};
}

// PDF's built-in Latin fonts have no Unicode glyphs for many scripts. The
// visible line image handles shaping; an invisible Type 3 font with a ToUnicode
// map makes the exact underlying characters available to search and copy.
function unicodeSearchLayer(doc, pages, type) {
  const characters = new Set();
  for (const commands of pages) for (const cmd of commands) {
    if (cmd.text && !type.nativeText(cmd.text)) for (const ch of cmd.text) characters.add(ch);
  }
  const lookup = new Map();
  if (characters.size) {
    const context = doc.context;
    const blank = context.register(context.flateStream('1000 0 d0'));
    const all = Array.from(characters);
    for (let start = 0; start < all.length; start += 255) {
      const chars = all.slice(start, start + 255);
      const name = PDFName.of('Search' + start);
      const names = chars.map((_, i) => 'g' + (i + 1));
      const codes = chars.map((char, i) => {
        const code = (i + 1).toString(16).padStart(2, '0');
        const utf16 = Array.from({length: char.length}, (_, j) => char.charCodeAt(j).toString(16).padStart(4, '0')).join('');
        lookup.set(char, {name, code});
        return `<${code}> <${utf16}>`;
      });
      const map = ['/CIDInit /ProcSet findresource begin 12 dict begin begincmap',
        '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
        `/CMapName /Dayleaf${start} def /CMapType 2 def`, '1 begincodespacerange <00> <FF> endcodespacerange'];
      for (let i = 0; i < codes.length; i += 100) {
        const chunk = codes.slice(i, i + 100);
        map.push(chunk.length + ' beginbfchar', ...chunk, 'endbfchar');
      }
      map.push('endcmap CMapName currentdict /CMap defineresource pop end end');
      const ref = context.register(context.obj({Type: 'Font', Subtype: 'Type3', Name: name,
        FontBBox: [0, -250, 1000, 900], FontMatrix: [.001, 0, 0, .001, 0, 0],
        FirstChar: 1, LastChar: chars.length, Widths: chars.map(() => 1000),
        Resources: {}, CharProcs: Object.fromEntries(names.map(key => [key, blank])),
        Encoding: {Type: 'Encoding', Differences: [1, ...names]}, ToUnicode: context.register(context.flateStream(map.join('\n'))),
      }));
      for (const ch of chars) lookup.get(ch).ref = ref;
    }
  }
  return (page, text, x, y, size, advance) => {
    const chars = Array.from(text);
    const scale = advance / (size * chars.length);
    page.pushOperators(beginText(), setTextMatrix(scale, 0, 0, 1, x, y), setTextRenderingMode(3));
    for (let i = 0; i < chars.length;) {
      const {name, ref} = lookup.get(chars[i]);
      let hex = '';
      while (i < chars.length && lookup.get(chars[i]).name === name) hex += lookup.get(chars[i++]).code;
      page.node.setFontDictionary(name, ref);
      page.pushOperators(setFontAndSize(name, size), showText(PDFHexString.of(hex)));
    }
    page.pushOperators(setTextRenderingMode(0), endText());
  };
}

const styles = {
  span: {size: 10, strong: true, before: 0, after: 3},
  h2: {size: 23, strong: true, before: 0, after: 4, keep: 22},
  h3: {size: 15, strong: true, before: 9, after: 5, keep: 56},
  h4: {size: 12, strong: true, before: 5, after: 3, keep: 34},
  p: {size: 10.5, before: 0, after: 6},
  li: {size: 10.5, before: 0, after: 3, indent: 12},
};

function layout(blocks, type, check) {
  const pages = [[]];
  let page = pages[0];
  let top = margin;
  let continuedForm;
  function newPage() {
    page = [];
    pages.push(page);
    top = margin;
    if (continuedForm) {
      for (const line of type.wrap(continuedForm + ' (continued)', width, styles.h4.size, true)) {
        textLine(line, margin, top, styles.h4.size, true, width);
        top += styles.h4.size * 1.5;
      }
      top += styles.h4.after;
    }
  }
  function textLine(text, x, at, size, strong, limit) {
    if (text) page.push({text, x, top: at, size, strong, color: strong ? green : ink, limit});
  }
  function paragraphHeight(kind, text) {
    const s = styles[kind];
    return s.before + type.wrap(text, width, s.size, s.strong).length * s.size * 1.5 + s.after;
  }
  function formHeight(form) {
    return paragraphHeight('h4', form.heading) + form.answers.reduce((h, a) => h + paragraphHeight('p', a), 0);
  }
  function paragraph(block) {
    const style = styles[block.kind] || styles.p;
    const indent = style.indent || 0;
    const lines = type.wrap(block.text, width - indent, style.size, style.strong);
    const leading = style.size * 1.5;
    if (top + style.before + (style.keep ? lines.length * leading + style.keep : leading) > bottom && top > margin) newPage();
    if (top > margin) top += style.before;
    lines.forEach((line, i) => {
      if (top + leading > bottom) newPage();
      if (block.kind === 'li' && i === 0) textLine('•', margin + 2, top, style.size, false, 8);
      textLine(line, margin + indent, top, style.size, style.strong, width - indent);
      top += leading;
    });
    top += style.after;
  }
  function table({header, rows}) {
    const count = header.length;
    // Short value columns remain compact, leaving space for narrative fields.
    const demands = header.map((title, i) => {
      let demand = Math.max(45, type.measure(title, tableSize, true) + 2 * padding);
      for (const row of rows) {
        demand = Math.max(demand, Math.min(280, type.measure((row[i] || '').slice(0, 100), tableSize, i === 0) + 2 * padding));
      }
      return demand;
    });
    const total = demands.reduce((a, b) => a + b, 0);
    const base = 40;
    const widths = demands.map(d => base + (width - base * count) * d / total);
    function wrapRow(cells, heading) {
      return cells.map((text, i) => type.wrap(text, widths[i] - 2 * padding, tableSize, heading || i === 0));
    }
    function drawSlice(cells, offset, n, heading, shaded) {
      const height = n * tableLeading + 2 * padding;
      if (heading || shaded) page.push({box: true, top, height, color: heading ? headerTint : tint});
      let x = margin;
      cells.forEach((lines, i) => {
        lines.slice(offset, offset + n).forEach((line, j) => textLine(line, x + padding, top + padding + j * tableLeading, tableSize, heading || i === 0, widths[i] - 2 * padding));
        x += widths[i];
      });
      top += height;
      page.push({rule: true, top});
    }
    const labels = wrapRow(header, true);
    const headingLines = Math.max(...labels.map(col => col.length));
    const headerHeight = headingLines * tableLeading + 2 * padding;
    const minRow = tableLeading + 2 * padding;
    const capacity = () => Math.floor((bottom - top - 2 * padding) / tableLeading);
    function continueTable() { newPage(); drawSlice(labels, 0, headingLines, true, false); }
    let firstHeight = minRow;
    if (rows.length) {
      const firstLines = Math.max(...wrapRow(rows[0], false).map(col => col.length));
      const fullHeight = firstLines * tableLeading + 2 * padding;
      if (margin + headerHeight + fullHeight <= bottom) firstHeight = fullHeight;
    }
    if (top + headerHeight + firstHeight > bottom) newPage();
    drawSlice(labels, 0, headingLines, true, false);
    rows.forEach((row, i) => {
      check();
      const cells = wrapRow(row, false);
      const n = Math.max(...cells.map(col => col.length));
      // Keep normal rows together. A row taller than a fresh page is split
      // in line units across as many pages as necessary with a repeated header.
      const fitsFresh = margin + headerHeight + n * tableLeading + 2 * padding <= bottom;
      if (capacity() < 1 || (n > capacity() && fitsFresh && i > 0)) continueTable();
      for (let offset = 0; offset < n;) {
        const take = Math.min(n - offset, capacity());
        drawSlice(cells, offset, take, false, i % 2 === 1);
        offset += take;
        if (offset < n) continueTable();
      }
    });
    top += 8;
  }
  for (const [index, block] of blocks.entries()) {
    check();
    if (block.kind === 'form') {
      const height = formHeight(block);
      if (height <= bottom - margin && top + height > bottom) newPage();
      paragraph({kind: 'h4', text: block.heading});
      continuedForm = block.heading;
      for (const text of block.answers) paragraph({kind: 'p', text});
      continuedForm = null;
    } else if (block.kind === 'h3' && blocks[index + 1]?.kind === 'form') {
      const height = paragraphHeight('h3', block.text) + formHeight(blocks[index + 1]);
      if (height <= bottom - margin && top + height > bottom) newPage();
      paragraph(block);
    } else if (block.kind === 'table') table(block);
    else paragraph(block);
  }
  return pages;
}

export async function buildReportPdf(article, {signal} = {}) {
  const check = () => { if (signal?.aborted) throw new DOMException('Report preparation was cancelled.', 'AbortError'); };
  check();
  const blocks = snapshot(article);
  const title = blocks.find(b => b.kind === 'h2')?.text;
  if (!title) throw new Error('The report preview is unavailable.');
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator('Dayleaf');
  doc.setProducer('Dayleaf');
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const type = createTypesetter(regular, bold);
  const pages = layout(blocks, type, check);
  const searchLayer = unicodeSearchLayer(doc, pages, type);
  for (const [i, commands] of pages.entries()) {
    check();
    const page = doc.addPage(paper);
    for (const cmd of commands) {
      const y = paper[1] - cmd.top;
      if (cmd.box) page.drawRectangle({x: margin, y: y - cmd.height, width, height: cmd.height, color: cmd.color});
      else if (cmd.rule) page.drawLine({start: {x: margin, y}, end: {x: margin + width, y}, thickness: .5, color: hairline});
      else await type.draw(doc, page, searchLayer, cmd.text, cmd.x, cmd.top, cmd.size, cmd.strong, cmd.color, cmd.limit);
    }
    const foot = `${i + 1} / ${pages.length}`;
    page.drawLine({start: {x: margin, y: 37}, end: {x: margin + width, y: 37}, thickness: .6, color: hairline});
    page.drawText(title, {x: margin, y: 23, size: 8, font: regular, color: green});
    page.drawText(foot, {x: margin + width - type.measure(foot, 8, false), y: 23, size: 8, font: regular, color: green});
    // Let lock and selection-change events cancel long-running preparations.
    if ((i + 1) % 4 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  const bytes = await doc.save();
  check();
  return new Blob([bytes], {type: 'application/pdf'});
}
