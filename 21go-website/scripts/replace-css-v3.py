import sys

with open('src/lib/pdf-quote.ts', 'r', encoding='utf-8') as f:
    content = f.read()

start = content.find('<style>')
end = content.find('</style>')
if start == -1 or end == -1:
    print('not found'); sys.exit(1)

# CSS comprimido, garante 1 pagina A4 (297mm)
new_css = '''<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; -webkit-font-smoothing: antialiased; }
  html, body {
    margin: 0; padding: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    color: #0F172A;
    background: #fff;
    line-height: 1.4;
    font-feature-settings: 'cv11', 'ss01', 'kern';
    letter-spacing: -0.01em;
  }
  .page {
    width: 210mm;
    height: 297mm;
    padding: 8mm 10mm;
    background: #fff;
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .laranja { color: #F7963D; font-weight: 700; }
  .verde { color: #25C168; }

  /* HEADER compacto */
  .hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid #F1F5F9;
  }
  .brand-logo { height: 38px; width: auto; display: block; object-fit: contain; }
  .brand-text { font-weight: 800; font-size: 18px; color: #1B4DA1; letter-spacing: -0.5px; }

  .wpp-btn {
    background: #25C168; color: #fff; text-decoration: none;
    padding: 6px 12px 6px 8px; border-radius: 999px;
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 10px; line-height: 1.15;
    box-shadow: 0 1px 4px rgba(37,193,104,0.18);
  }
  .wpp-btn .wpp-icon {
    width: 20px; height: 20px;
    background: rgba(255,255,255,0.2); border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 10px; flex-shrink: 0;
  }
  .wpp-btn .wpp-text b { font-weight: 700; font-size: 10px; display: block; }

  /* GREETING compacto */
  .greet { margin-bottom: 8px; }
  .greet h1 {
    font-size: 16px; font-weight: 700;
    color: #0F172A; margin: 0 0 2px;
    letter-spacing: -0.02em; line-height: 1.2;
  }
  .greet-sub {
    font-size: 10px; color: #475569;
    margin: 0; line-height: 1.4;
  }
  .greet-sub b { color: #0F172A; font-weight: 600; }
  .greet-fipe-note {
    color: #94A3B8; font-size: 9px; font-style: italic;
    margin-left: 3px;
  }

  /* CONDICOES PILLS */
  .condicoes {
    display: flex; flex-wrap: wrap; gap: 4px;
    margin-bottom: 6px;
  }
  .cond-pill {
    background: #FFF7ED; border: 1px solid rgba(247,150,61,0.25);
    color: #B45309; font-size: 9px; font-weight: 500;
    padding: 3px 9px; border-radius: 999px;
    display: flex; align-items: center; gap: 4px;
  }
  .cond-pill b { color: #92400E; font-weight: 700; }
  .cond-dot { font-size: 9px; }

  /* REF BAR — 4 cenarios em grid 4 colunas */
  .ref-bar {
    background: linear-gradient(135deg, #FFF7ED 0%, #FFFAF0 100%);
    border: 1px solid rgba(247,150,61,0.3);
    border-radius: 10px;
    padding: 8px 12px;
    margin-bottom: 8px;
  }
  .ref-bar-header {
    margin-bottom: 6px;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(247,150,61,0.15);
  }
  .ref-bar-title {
    display: flex; align-items: baseline; gap: 8px;
  }
  .ref-bar-eyebrow {
    font-size: 8px; font-weight: 700;
    color: #B45309; text-transform: uppercase;
    letter-spacing: 1.2px;
  }
  .ref-bar-name {
    font-size: 13px; font-weight: 700;
    color: #0F172A; letter-spacing: -0.02em;
  }
  .ref-bar-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: 6px;
  }
  .ref-disc {
    background: #fff;
    border-radius: 8px;
    padding: 7px 9px;
    border: 1px solid #F1F5F9;
    text-align: left;
    display: flex; flex-direction: column; gap: 1px;
  }
  .ref-disc.highlight {
    background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%);
    border-color: #25C168;
  }
  .ref-disc-label {
    font-size: 9.5px; font-weight: 600; color: #475569;
    line-height: 1.2;
  }
  .ref-disc-tag {
    font-size: 8.5px; font-weight: 700;
    color: #94A3B8; letter-spacing: 0.2px;
  }
  .ref-disc.highlight .ref-disc-tag { color: #059669; }
  .ref-disc-val {
    font-size: 14px; font-weight: 800;
    color: #0F172A; letter-spacing: -0.03em;
    margin-top: 2px;
  }
  .ref-disc.highlight .ref-disc-val { color: #059669; }

  /* ENTRADA compacta */
  .entrada {
    background: #fff;
    border: 1px solid #E5E7EB;
    border-radius: 8px;
    padding: 7px 12px;
    margin-bottom: 8px;
    display: flex; align-items: center;
    justify-content: space-between; gap: 12px;
  }
  .entrada-left { display: flex; flex-direction: column; gap: 1px; }
  .entrada-label {
    font-size: 8px; font-weight: 700; color: #94A3B8;
    text-transform: uppercase; letter-spacing: 1.2px;
  }
  .entrada-sub {
    font-size: 9.5px; color: #475569; font-weight: 500;
  }
  .entrada-vals { display: flex; align-items: baseline; gap: 14px; }
  .entrada-vals-item { display: flex; flex-direction: column; align-items: flex-end; }
  .entrada-vals-tag {
    font-size: 8px; color: #94A3B8; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.6px;
  }
  .entrada-vals-num {
    font-size: 13px; font-weight: 800; color: #F7963D;
    letter-spacing: -0.03em;
  }

  /* TABELA — comprimida */
  .comparison {
    background: #fff;
    border: 1px solid #E5E7EB;
    border-radius: 10px;
    overflow: hidden;
    flex: 1;
    margin-bottom: 8px;
  }
  .cmp-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9.5px;
  }
  .cmp-table thead th {
    padding: 8px 6px; text-align: center;
    border-bottom: 1px solid #E5E7EB;
    vertical-align: top; background: #FAFAFA;
  }
  .cmp-corner {
    background: #fff !important;
    text-align: left; width: 26%;
    padding: 8px 12px !important;
  }
  .cmp-corner-eyebrow {
    font-size: 8px; font-weight: 700;
    color: #94A3B8; text-transform: uppercase;
    letter-spacing: 1.2px; display: block; margin-bottom: 2px;
  }
  .cmp-corner-title {
    font-size: 11px; font-weight: 700;
    color: #0F172A; letter-spacing: -0.02em;
  }
  .plan-col {
    border-left: 1px solid #F1F5F9;
    position: relative;
  }
  .plan-col.selected {
    background: #FFFBEB !important;
  }
  .plan-col.selected::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px; background: #F7963D;
  }
  .plan-flag {
    display: inline-block;
    background: #0F172A; color: #fff;
    font-size: 7px; font-weight: 700;
    padding: 2px 6px; border-radius: 999px;
    text-transform: uppercase; letter-spacing: 0.5px;
    margin-bottom: 4px;
  }
  .plan-flag.selected { background: #F7963D; }
  .plan-flag.pop { background: #25C168; }
  .plan-name {
    font-size: 11px; font-weight: 700;
    color: #0F172A; letter-spacing: -0.02em;
    margin-bottom: 3px;
  }
  .plan-price {
    font-size: 16px; font-weight: 800;
    color: #0F172A; letter-spacing: -0.03em;
    line-height: 1;
  }
  .plan-price em {
    font-size: 9px; font-style: normal;
    color: #94A3B8; font-weight: 500;
  }

  .cmp-table tbody tr {
    border-bottom: 1px solid #F1F5F9;
  }
  .cmp-table tbody tr:last-child { border-bottom: none; }
  .cmp-table tbody tr:nth-child(even) { background: #FAFAFA; }
  .row-label {
    text-align: left;
    padding: 5px 12px;
    font-size: 9.5px; font-weight: 500;
    color: #1F2937;
  }
  .cell {
    padding: 5px 6px;
    text-align: center;
    border-left: 1px solid #F1F5F9;
    vertical-align: middle;
  }
  .cell.no { opacity: 0.45; }
  .cell-icon {
    display: inline-flex; align-items: center; justify-content: center;
    width: 14px; height: 14px;
    border-radius: 50%;
    font-size: 9px; font-weight: 800;
    flex-shrink: 0; line-height: 1;
  }
  .cell-icon.ok { background: #25C168; color: #fff; }
  .cell-icon.no { background: #E5E7EB; color: #94A3B8; }
  .cell-detail {
    display: block;
    font-size: 8.5px; font-weight: 500;
    color: #64748B;
    margin-top: 2px; line-height: 1.2;
  }

  /* FOOTER compacto */
  .pdf-footer {
    background: #0F172A;
    color: #fff;
    border-radius: 10px;
    padding: 8px 12px;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .footer-consultor {
    display: flex; align-items: center; gap: 8px;
  }
  .footer-avatar {
    width: 30px; height: 30px;
    border-radius: 50%;
    background: linear-gradient(135deg, #F7963D 0%, #FB923C 100%);
    color: #fff; font-weight: 700; font-size: 11px;
    display: inline-flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .footer-consultor-info {
    display: flex; flex-direction: column; gap: 0;
  }
  .footer-eyebrow {
    font-size: 7.5px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 1.2px;
    color: #94A3B8;
  }
  .footer-name {
    font-size: 11px; font-weight: 600;
    color: #fff; letter-spacing: -0.02em;
  }
  .footer-meta {
    text-align: center;
    font-size: 8px; color: #94A3B8;
    letter-spacing: 0.01em;
  }
</style>'''

new_content = content[:start] + new_css + content[end + len('</style>'):]
with open('src/lib/pdf-quote.ts', 'w', encoding='utf-8') as f:
    f.write(new_content)
print('CSS comprimido aplicado')
