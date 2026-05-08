import sys

with open('src/lib/pdf-quote.ts', 'r', encoding='utf-8') as f:
    content = f.read()

start = content.find('<style>')
end = content.find('</style>')
if start == -1 or end == -1:
    print('not found')
    sys.exit(1)

new_css = '''<style>
  /*  21Go - Simulacao Protecao Veicular  */
  /*  Design system: minimal, premium, espacado  */

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
    background: #FAFAFA;
    line-height: 1.5;
    font-feature-settings: 'cv11', 'ss01', 'kern';
    letter-spacing: -0.01em;
  }
  .page {
    width: 210mm;
    padding: 14mm 14mm 12mm;
    background: #fff;
    position: relative;
  }

  /* HEADER */
  .hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
    padding-bottom: 18px;
    border-bottom: 1px solid #F1F5F9;
  }
  .brand-logo { height: 50px; width: auto; display: block; object-fit: contain; }
  .brand-text { font-weight: 800; font-size: 22px; color: #1B4DA1; letter-spacing: -0.5px; }

  .wpp-btn {
    background: #25C168;
    color: #fff;
    text-decoration: none;
    padding: 8px 14px 8px 10px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    line-height: 1.2;
    box-shadow: 0 2px 8px rgba(37,193,104,0.18);
  }
  .wpp-btn .wpp-icon {
    width: 24px; height: 24px;
    background: rgba(255,255,255,0.2);
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    flex-shrink: 0;
  }
  .wpp-btn .wpp-text {
    line-height: 1.2;
  }
  .wpp-btn .wpp-text b { font-weight: 700; font-size: 11px; display: block; }

  /* GREETING */
  .greet {
    margin-bottom: 22px;
  }
  .greet h1 {
    font-size: 24px;
    font-weight: 700;
    color: #0F172A;
    margin: 0 0 8px;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }
  .greet-sub {
    font-size: 12px;
    color: #475569;
    margin: 0;
    line-height: 1.55;
    max-width: 95%;
  }
  .greet-sub b { color: #0F172A; font-weight: 600; }
  .greet-fipe-note {
    color: #94A3B8;
    font-size: 11px;
    margin-left: 4px;
  }
  .laranja { color: #F7963D; font-weight: 700; }
  .verde { color: #25C168; }

  /* CONDICOES PILLS */
  .condicoes {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 16px;
  }
  .cond-pill {
    background: #FFF7ED;
    border: 1px solid rgba(247,150,61,0.25);
    color: #B45309;
    font-size: 10px;
    font-weight: 500;
    padding: 5px 12px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .cond-pill b { color: #92400E; font-weight: 700; }
  .cond-dot { font-size: 10px; }

  /* REF BAR — versao premium, card unico clean */
  .ref-bar {
    background: #fff;
    border: 1px solid #E5E7EB;
    border-radius: 14px;
    padding: 18px 22px;
    margin-bottom: 14px;
    box-shadow: 0 1px 3px rgba(15,23,42,0.04);
  }
  .ref-bar-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 14px;
    padding-bottom: 14px;
    border-bottom: 1px solid #F1F5F9;
  }
  .ref-bar-title {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .ref-bar-eyebrow {
    font-size: 9px;
    font-weight: 700;
    color: #94A3B8;
    text-transform: uppercase;
    letter-spacing: 1.2px;
  }
  .ref-bar-name {
    font-size: 17px;
    font-weight: 700;
    color: #0F172A;
    letter-spacing: -0.02em;
  }
  .ref-bar-mainprice {
    font-size: 26px;
    font-weight: 800;
    color: #0F172A;
    letter-spacing: -0.04em;
    line-height: 1;
  }
  .ref-bar-mainprice small {
    font-size: 12px;
    font-weight: 500;
    color: #94A3B8;
    margin-left: 2px;
  }
  .ref-bar-discounts {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
  }
  .ref-disc {
    background: #F8FAFC;
    border-radius: 10px;
    padding: 12px 14px;
    border: 1px solid transparent;
  }
  .ref-disc.highlight {
    background: linear-gradient(135deg, #ECFDF5 0%, #DCFCE7 100%);
    border-color: rgba(37,193,104,0.3);
  }
  .ref-disc-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
  }
  .ref-disc-label {
    font-size: 10.5px;
    font-weight: 600;
    color: #475569;
  }
  .ref-disc-tag {
    font-size: 9.5px;
    font-weight: 700;
    color: #94A3B8;
  }
  .ref-disc.highlight .ref-disc-tag {
    color: #059669;
  }
  .ref-disc-val {
    font-size: 17px;
    font-weight: 800;
    color: #0F172A;
    letter-spacing: -0.03em;
    margin-top: 4px;
  }
  .ref-disc.highlight .ref-disc-val {
    color: #059669;
  }

  /* ENTRADA */
  .entrada {
    background: #fff;
    border: 1px solid #E5E7EB;
    border-radius: 12px;
    padding: 14px 18px;
    margin-bottom: 22px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    box-shadow: 0 1px 3px rgba(15,23,42,0.04);
  }
  .entrada-left {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .entrada-label {
    font-size: 9px;
    font-weight: 700;
    color: #94A3B8;
    text-transform: uppercase;
    letter-spacing: 1.2px;
  }
  .entrada-sub {
    font-size: 11px;
    color: #475569;
    font-weight: 500;
  }
  .entrada-vals {
    display: flex;
    align-items: baseline;
    gap: 16px;
  }
  .entrada-vals-item {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }
  .entrada-vals-tag {
    font-size: 9px;
    color: #94A3B8;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }
  .entrada-vals-num {
    font-size: 16px;
    font-weight: 800;
    color: #F7963D;
    letter-spacing: -0.03em;
  }

  /* COMPARISON TABLE — premium */
  .comparison {
    background: #fff;
    border: 1px solid #E5E7EB;
    border-radius: 14px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(15,23,42,0.04);
    margin-bottom: 22px;
  }
  .cmp-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10.5px;
  }
  .cmp-table thead th {
    padding: 16px 12px;
    text-align: center;
    border-bottom: 1px solid #E5E7EB;
    vertical-align: top;
    background: #FAFAFA;
  }
  .cmp-corner {
    background: #fff !important;
    text-align: left;
    width: 26%;
    padding: 16px 18px !important;
  }
  .cmp-corner-eyebrow {
    font-size: 9px;
    font-weight: 700;
    color: #94A3B8;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    display: block;
    margin-bottom: 4px;
  }
  .cmp-corner-title {
    font-size: 14px;
    font-weight: 700;
    color: #0F172A;
    letter-spacing: -0.02em;
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
    height: 3px;
    background: #F7963D;
  }
  .plan-flag {
    display: inline-block;
    background: #0F172A;
    color: #fff;
    font-size: 8px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    margin-bottom: 8px;
  }
  .plan-flag.selected { background: #F7963D; }
  .plan-flag.pop { background: #25C168; }
  .plan-name {
    font-size: 13px;
    font-weight: 700;
    color: #0F172A;
    letter-spacing: -0.02em;
    margin-bottom: 6px;
  }
  .plan-price {
    font-size: 20px;
    font-weight: 800;
    color: #0F172A;
    letter-spacing: -0.04em;
    line-height: 1;
  }
  .plan-price small {
    font-size: 11px;
    font-weight: 500;
    color: #94A3B8;
  }
  .plan-price em {
    font-size: 10px;
    font-style: normal;
    color: #94A3B8;
    font-weight: 500;
  }

  .cmp-table tbody tr {
    border-bottom: 1px solid #F1F5F9;
  }
  .cmp-table tbody tr:last-child {
    border-bottom: none;
  }
  .cmp-table tbody tr:nth-child(even) {
    background: #FAFAFA;
  }
  .row-label {
    text-align: left;
    padding: 11px 18px;
    font-size: 11px;
    font-weight: 500;
    color: #1F2937;
  }
  .cell {
    padding: 11px 8px;
    text-align: center;
    border-left: 1px solid #F1F5F9;
    vertical-align: middle;
  }
  .cell.no { opacity: 0.45; }
  .cell-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    font-size: 11px;
    font-weight: 800;
    flex-shrink: 0;
    line-height: 1;
  }
  .cell-icon.ok { background: #25C168; color: #fff; }
  .cell-icon.no { background: #E5E7EB; color: #94A3B8; }
  .cell-detail {
    display: block;
    font-size: 9.5px;
    font-weight: 500;
    color: #64748B;
    margin-top: 4px;
    line-height: 1.3;
  }

  /* FOOTER consultor */
  .pdf-footer {
    background: #0F172A;
    color: #fff;
    border-radius: 14px;
    padding: 14px 18px;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .footer-consultor {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .footer-avatar {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: linear-gradient(135deg, #F7963D 0%, #FB923C 100%);
    color: #fff;
    font-weight: 700;
    font-size: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    letter-spacing: -0.02em;
  }
  .footer-consultor-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .footer-eyebrow {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    color: #94A3B8;
  }
  .footer-name {
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    letter-spacing: -0.02em;
  }
  .footer-meta {
    text-align: center;
    font-size: 9.5px;
    color: #94A3B8;
    margin-top: 6px;
    letter-spacing: 0.01em;
  }
</style>'''

new_content = content[:start] + new_css + content[end + len('</style>'):]
with open('src/lib/pdf-quote.ts', 'w', encoding='utf-8') as f:
    f.write(new_content)
print('CSS premium aplicado')
