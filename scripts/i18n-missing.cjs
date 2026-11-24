// Lista os textos das telas internas que ainda não estão em apps/web/src/i18n/{en,zh}.json.
// Uso: node scripts/i18n-missing.cjs
// Os textos públicos (apps/web/src/public) e os impressos ficam de fora, de propósito.
const fs = require('fs')
const path = require('path')
const ts = require('typescript')

const root = path.join(__dirname, '..')
const dirs = [path.join(root, 'apps/web/src'), path.join(root, 'packages/contracts/src')]
const skipDirs = ['public', 'print', 'i18n']
const files = []
const walk = d => {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f)
    if (fs.statSync(p).isDirectory()) { if (!skipDirs.includes(f)) walk(p) }
    else if (/\.tsx?$/.test(f) && !/\.test\./.test(f)) files.push(p)
  }
}
dirs.forEach(walk)

const NON_TEXT_ATTRS = /^(className|bodyClassName|style|key|href|to|id|type|role|variant|tone|size|src|name|as|method|inputMode|autoComplete|accept|rel|target|lang|htmlFor|data-.*|aria-(hidden|current|selected|pressed|expanded|controls|describedby|invalid))$/
const looksLikeText = s => {
  const t = s.trim()
  if (t.length < 2 || !/\p{L}/u.test(t)) return false
  if (/^(https?:|mailto:|\/|\.|#|\(|\[|:|@|var\(|rgb|data:)/.test(t)) return false
  if (/^[a-z0-9_./:-]+$/.test(t) && !/[áéíóúâêôãõç]/.test(t)) return false
  if (/(^|\s)(text|bg|flex|grid|px|py|mt|mb|rounded|border|size|h|w|gap|font|items|justify)-/.test(t)) return false
  if (/^[A-Z_]+$/.test(t) || /^[A-Z][A-Za-z]+(Page|Drawer|Panel)$/.test(t)) return false
  return /[ãõçáéíóúâêà]|\b(de|da|do|para|com|sem|não|e|o|a|os|as)\b|^[A-ZÁÉÍÓÚ][a-zà-ú]/.test(t) // cara de português
}

const found = new Set()
for (const file of files) {
  const src = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const visit = node => {
    const parent = node.parent
    const attr = parent && ts.isJsxAttribute(parent) ? parent.name.getText() : parent && ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent) ? parent.parent.name.getText() : null
    const skip = (parent && (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || (ts.isPropertyAssignment(parent) && parent.name === node))) || (attr && NON_TEXT_ATTRS.test(attr))
    if (!skip) {
      let text = null
      if (ts.isJsxText(node)) text = node.getText()
      else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text
      else if (ts.isTemplateExpression(node)) {
        let i = 0
        text = node.head.text + node.templateSpans.map(s => `{${i++}}${s.literal.text}`).join('')
      }
      if (text !== null) {
        const t = text.replace(/\s+/g, ' ').trim()
        if (looksLikeText(t.replace(/\{\d+\}/g, ''))) found.add(t)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(src)
}

const en = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/src/i18n/en.json'), 'utf8'))
const zh = JSON.parse(fs.readFileSync(path.join(root, 'apps/web/src/i18n/zh.json'), 'utf8'))
const missing = [...found].filter(s => !(s in en) || !(s in zh)).sort()
console.log(missing.length ? `Sem tradução (${missing.length}):\n` + missing.map(s => '  ' + s).join('\n') : 'Tudo traduzido.')
console.log('\nAcrescente cada texto, com a mesma chave em português, nos dois arquivos de apps/web/src/i18n.')
