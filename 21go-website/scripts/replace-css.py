import sys

with open('src/lib/pdf-quote.ts', 'r', encoding='utf-8') as f:
    content = f.read()

start = content.find('<style>')
end = content.find('</style>')
if start == -1 or end == -1:
    print('not found')
    sys.exit(1)

new_css = '''<style>
  /* 21Go - Simulacao Protecao Veicular (1 pagina comparativa) */
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #1F2937;
    background: #fff;
    line-height: 1.4;
  }
  .page {
    width: 210mm;
    padding: 12mm 14mm;
    background: #fff;
    position: relative;
  }
  .laranja { color: #F7963D; }
  .verde { color: #25C168; }

  /* HEADER */
  .hero {
    display: flex; align-items: center; justify-content: space-between;
    padding-bottom: 14px;
    margin-bottom: 16px;
  }
  .brand-logo { height: 70px; width: auto; display: block; object-fit: contain; }
  .brand-text { font-weight: 900; font-size: 28px; color: #1B4DA1; letter-spacing: -0.6px; }

  .wpp-btn {
    background: #25C168; color: #fff; text-decoration: none;
    padding: 10px 18px; border-radius: 999px;
    display: inline-flex; align-items: center; gap: 10px;
    font-size: 12px; line-height: 1.2;
    box-shadow: 0 4px 14px rgba(37,193,104,0.3);
  }
  .wpp-btn .wpp-icon {
    font-size: 18px;
    background: rgba(255,255,255,0.18);
    width: 32px; height: 32px;
    border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .wpp-btn .wpp-text b { font-weight: 800; font-size: 12px; }
  .wpp-btn.small { padding: 8px 14px; }
  .wpp-btn.small .wpp-icon { width: 26px; height: 26px; font-size: 14px; }

  /* REF BAR (PLANO DE REFERENCIA) */
  .ref-bar {
    background: linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 100%);
    border: 2px solid #F7963D;
    border-radius: 14px;
    padding: 12px 18px;
    margin-bottom: 16px;
    display: flex; align-items: center; justify-content: space-between;
    gap: 16px;
    box-shadow: 0 4px 14px rgba(247,150,61,0.12);
  }
  .ref-bar-left {
    display: flex; flex-direction: column; gap: 4px;
    min-width: 150px;
  }
  .ref-bar-eyebrow {
    font-size: 9px; font-weight: 800;
    color: #B45309; text-transform: uppercase;
    letter-spacing: 1.5px;
  }
  .ref-bar-row {
    display: flex; align-items: baseline; gap: 10px;
  }
  .ref-bar-name {
    font-size: 12px; color: #92400E;
  }
  .ref-bar-name b {
    font-size: 17px; color: #0F172A; font-weight: 800;
    margin-right: 4px;
  }
  .ref-bar-price {
    font-size: 18px; font-weight: 900;
    color: #F7963D; letter-spacing: -0.4px;
    line-height: 1;
  }
  .ref-bar-price small {
    font-size: 10px; font-weight: 600;
    color: #B45309; margin-left: 1px;
  }
  .ref-bar-discounts {
    display: flex; gap: 8px; align-items: center;
    flex: 1; justify-content: flex-end;
  }
  .ref-disc {
    background: #fff;
    border-radius: 10px;
    padding: 7px 12px;
    border: 1.5px solid rgba(247,150,61,0.25);
    display: flex; flex-direction: column;
    gap: 2px; min-width: 105px;
    text-align: center;
  }
  .ref-disc.highlight {
    border-color: #25C168;
    background: linear-gradient(135deg, #fff 0%, #DCFCE7 100%);
  }
  .ref-disc-label {
    font-size: 9.5px; color: #64748B; font-weight: 700;
  }
  .ref-disc-tag {
    font-size: 8.5px; font-weight: 800;
    color: #25C168; letter-spacing: 0.5px;
  }
  .ref-disc-val {
    font-size: 14px; font-weight: 900;
    color: #0F172A; letter-spacing: -0.3px;
  }
  .ref-disc-val.verde { color: #25C168; }
  .ref-arrow {
    font-size: 16px; font-weight: 900; color: #F7963D;
  }

  /* GREETING */
  .greet { margin-bottom: 14px; }
  .greet h1 {
    font-size: 22px; font-weight: 800;
    color: #0F172A; margin: 0 0 6px;
    letter-spacing: -0.4px; line-height: 1.15;
  }
  .greet-sub {
    font-size: 12px; color: #475569;
    margin: 0; line-height: 1.5;
  }
  .greet-sub b { color: #0F172A; font-weight: 700; }
  .greet-fipe-note {
    font-size: 10px; color: #94A3B8; font-style: italic;
    margin-left: 4px;
  }

  /* CONDICOES PILLS */
  .condicoes {
    display: flex; flex-wrap: wrap; gap: 6px;
    margin-bottom: 12px;
  }
  .cond-pill {
    background: #FFF7ED; border: 1px solid rgba(247,150,61,0.3);
    color: #B45309; font-size: 10px; font-weight: 600;
    padding: 5px 11px; border-radius: 999px;
    display: flex; align-items: center; gap: 6px;
  }
  .cond-pill b { color: #92400E; font-weight: 800; }
  .cond-dot { font-size: 11px; }

  /* ENTRADA */
  .entrada {
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 12px;
    padding: 11px 16px;
    margin-bottom: 14px;
    display: flex; align-items: center; gap: 10px;
    font-size: 12px; color: #475569;
  }
  .entrada-icon { font-size: 16px; }
  .entrada-label { font-weight: 600; }
  .entrada-val { font-weight: 600; color: #0F172A; }
  .entrada-val b { color: #F7963D; font-weight: 800; font-size: 13px; }
  .entrada-or { color: #94A3B8; font-weight: 500; margin: 0 4px; }

  /* COMPARISON TABLE */
  .comparison {
    background: #fff;
    border: 1px solid #E2E8F0;
    border-radius: 14px;
    overflow: hidden;
    box-shadow: 0 4px 14px rgba(15,23,42,0.04);
    margin-bottom: 14px;
  }
  .cmp-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10.5px;
  }
  .cmp-table thead th {
    background: #fff;
    padding: 14px 10px;
    text-align: center;
    border-bottom: 2px solid #F1F5F9;
    vertical-align: top;
  }
  .cmp-corner {
    background: #1B4DA1 !important;
    color: #fff;
    text-align: center;
    width: 25%;
    border-bottom: 2px solid #1B4DA1 !important;
  }
  .cmp-corner-num {
    font-size: 32px; font-weight: 900;
    line-height: 1; letter-spacing: -1px;
  }
  .cmp-corner-txt {
    font-size: 10px; font-weight: 600;
    margin-top: 4px; opacity: 0.9;
  }
  .plan-col {
    position: relative;
    border-left: 1px solid #F1F5F9;
  }
  .plan-col.selected {
    background: linear-gradient(180deg, #FFF7ED 0%, #fff 100%) !important;
  }
  .plan-flag {
    display: inline-block;
    background: #F7963D; color: #fff;
    font-size: 8px; font-weight: 800;
    padding: 3px 8px; border-radius: 999px;
    text-transform: uppercase; letter-spacing: 0.6px;
    margin-bottom: 6px;
  }
  .plan-flag.pop { background: #25C168; }
  .plan-name {
    font-size: 13px; font-weight: 800;
    color: #0F172A; letter-spacing: -0.3px;
    margin-bottom: 4px;
  }
  .plan-price {
    font-size: 22px; font-weight: 900;
    color: #F7963D; letter-spacing: -0.7px;
    line-height: 1;
  }
  .plan-price small { font-size: 11px; font-weight: 600; color: #94A3B8; }
  .plan-price em { font-size: 10px; font-style: normal; color: #94A3B8; font-weight: 600; }
  .plan-col.selected .plan-price { color: #0F172A; }

  .cmp-table tbody tr {
    border-bottom: 1px solid #F1F5F9;
  }
  .cmp-table tbody tr:last-child { border-bottom: none; }
  .row-label {
    text-align: left;
    padding: 9px 14px;
    font-size: 10.5px; font-weight: 600;
    color: #1F2937;
    background: #FAFBFC;
    border-right: 1px solid #F1F5F9;
    width: 25%;
  }
  .cell {
    padding: 9px 8px;
    text-align: center;
    border-left: 1px solid #F1F5F9;
    vertical-align: middle;
  }
  .cell.no { background: #FAFBFC; }
  .cell-icon {
    display: inline-flex; align-items: center; justify-content: center;
    width: 18px; height: 18px;
    border-radius: 50%;
    font-size: 11px; font-weight: 900;
    flex-shrink: 0;
  }
  .cell-icon.ok { background: #25C168; color: #fff; }
  .cell-icon.no { background: #E5E7EB; color: #9CA3AF; }
  .cell-detail {
    display: block;
    font-size: 9.5px; font-weight: 600;
    color: #475569;
    margin-top: 3px;
    line-height: 1.25;
  }

  /* FOOTER */
  .pdf-footer {
    background: #1F2937;
    color: #fff;
    border-radius: 12px;
    padding: 14px 18px;
    margin-bottom: 8px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .footer-consultor {
    display: flex; align-items: center; gap: 12px;
  }
  .footer-avatar {
    width: 44px; height: 44px;
    border-radius: 50%;
    background: linear-gradient(135deg, #475569, #64748B);
    color: #fff; font-weight: 800; font-size: 14px;
    display: inline-flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .footer-consultor-info {
    display: flex; flex-direction: column; gap: 1px;
  }
  .footer-eyebrow {
    font-size: 9.5px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 1px;
    color: #94A3B8;
  }
  .footer-name {
    font-size: 14px; font-weight: 700;
    color: #fff; letter-spacing: -0.2px;
  }
  .footer-meta {
    text-align: center;
    font-size: 9.5px; color: #94A3B8;
    margin-top: 6px;
  }
</style>'''

new_content = content[:start] + new_css + content[end + len('</style>'):]
with open('src/lib/pdf-quote.ts', 'w', encoding='utf-8') as f:
    f.write(new_content)
print('CSS substituido com sucesso')
