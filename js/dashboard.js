/** 完整经营总览仪表盘 — 与 Django templates/dashboard.html 对齐 */

let _revCostChart = null;
let _categoryChart = null;

function fmtMoneyInt(n) {
  return "¥" + Number(n || 0).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function fmtPct(v) {
  if (v == null) return "";
  const sign = v >= 0 ? "▲" : "▼";
  const cls = v >= 0 ? "delta-up" : "delta-down";
  return `<span class="delta ${cls}">${sign} YoY ${Math.abs(v).toFixed(1)}%</span>`;
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const QUICK_NAV = {
  "orders:create": "page-orders",
  "orders:list": "page-orders",
  "customers:list": "page-customers",
  "production:tasks": "page-production",
};

function destroyDashboardCharts() {
  if (_revCostChart) {
    _revCostChart.destroy();
    _revCostChart = null;
  }
  if (_categoryChart) {
    _categoryChart.destroy();
    _categoryChart = null;
  }
}

function initDashboardCharts(d) {
  if (typeof Chart === "undefined") return;

  const gridColor = "#d0d7de";
  const tickColor = "#656d76";
  const fontMono = {
    family: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    size: 10,
  };

  Chart.defaults.color = tickColor;
  Chart.defaults.borderColor = gridColor;
  Chart.defaults.font = fontMono;

  const revCanvas = document.getElementById("revCostChart");
  const catCanvas = document.getElementById("categoryDonut");
  if (!revCanvas || !catCanvas) return;

  destroyDashboardCharts();

  _revCostChart = new Chart(revCanvas, {
    type: "line",
    data: {
      labels: d.chart_labels || [],
      datasets: [
        {
          label: "营收",
          data: d.revenue_series || [],
          borderColor: "#0969da",
          backgroundColor: "rgba(9,105,218,0.08)",
          tension: 0.25,
          fill: false,
          pointRadius: 2,
        },
        {
          label: "生产成本",
          data: d.cost_series || [],
          borderColor: "#cf222e",
          tension: 0.25,
          fill: false,
          pointRadius: 2,
        },
        {
          label: "毛利",
          data: d.profit_series || [],
          borderColor: "#1a7f37",
          tension: 0.25,
          fill: false,
          pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: tickColor, maxRotation: 0 } },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: tickColor,
            callback(v) {
              return v >= 10000 ? v / 10000 + "万" : v;
            },
          },
        },
      },
    },
  });

  _categoryChart = new Chart(catCanvas, {
    type: "doughnut",
    data: {
      labels: d.cat_labels || [],
      datasets: [
        {
          data: d.cat_values || [],
          backgroundColor: ["#0969da", "#1a7f37", "#9a6700", "#8250df", "#cf222e", "#656d76"],
          borderColor: "#ffffff",
          borderWidth: 2,
        },
      ],
    },
    options: {
      cutout: "62%",
      plugins: {
        legend: {
          position: "bottom",
          labels: { boxWidth: 10, padding: 8, color: tickColor, font: fontMono },
        },
      },
    },
  });
}

function renderDashboard(d, container) {
  const kpi = d.kpi || {};
  const yearLabel = d.year_label || new Date().getFullYear();

  const arRows =
    (d.ar_rows || [])
      .map(
        (row) => `
      <tr>
        <td class="name-cell">${escHtml(row.customer)}</td>
        <td class="val-blue">${fmtMoneyInt(row.amount)}</td>
        <td>${row.term_days != null ? escHtml(row.term_days) + "天" : "—"}</td>
        <td class="status-${escHtml(row.status_key)}">
          <span class="status-dot"></span>${escHtml(row.status_text)}
        </td>
      </tr>`
      )
      .join("") || `<tr><td colspan="4" class="name-cell" style="color:var(--sci-muted)">暂无未结应收</td></tr>`;

  const costRows = (d.cost_breakdown || [])
    .map(
      (item) => `
      <div class="cost-row">
        <div class="cost-meta">
          <span>${escHtml(item.name)}</span>
          <span>${item.pct}% · ${fmtMoneyInt(item.value)}</span>
        </div>
        <div class="cost-bar">
          <div class="cost-bar-fill" style="width:${item.pct}%;background:${escHtml(item.color)}"></div>
        </div>
      </div>`
    )
    .join("");

  const quickLinks = (d.quick_links || [])
    .map((link) => {
      const page = QUICK_NAV[link.url_name];
      if (page) {
        return `<button type="button" class="sci-quick-btn" data-nav="${page}">${escHtml(link.label)}</button>`;
      }
      return `<span class="sci-quick-muted">${escHtml(link.label)}</span>`;
    })
    .join("");

  container.innerHTML = `
    <div class="sci-dash">
      <div class="sci-grid-kpi">
        <div class="sci-card">
          <p class="sci-kpi-label">年度营收</p>
          <p class="sci-kpi-value val-blue">${fmtMoneyInt(kpi.year_revenue)}</p>
          <div class="sci-kpi-sub">
            ${kpi.revenue_yoy != null ? fmtPct(kpi.revenue_yoy) : ""}
            <span>本月 ${fmtMoneyInt(kpi.month_revenue)}</span>
          </div>
        </div>
        <div class="sci-card">
          <p class="sci-kpi-label">毛利率</p>
          <p class="sci-kpi-value val-green">${kpi.margin_pct ?? 0}%</p>
          <div class="sci-kpi-sub">
            <span class="delta delta-up">▲ +${kpi.margin_delta ?? 0} pp</span>
            <span>毛利 ${fmtMoneyInt(kpi.gross_profit)}</span>
          </div>
        </div>
        <div class="sci-card">
          <p class="sci-kpi-label">库存周转</p>
          <p class="sci-kpi-value val-yellow">${kpi.inventory_turnover ?? 0}×</p>
          <div class="sci-kpi-sub">
            <span class="delta delta-down">▼ ${kpi.turnover_delta ?? 0}</span>
            <span>低库存物料 <strong class="val-yellow">${kpi.low_stock ?? 0}</strong></span>
          </div>
        </div>
        <div class="sci-card">
          <p class="sci-kpi-label">应收账款</p>
          <p class="sci-kpi-value val-purple">${fmtMoneyInt(kpi.ar_total)}</p>
          <div class="sci-kpi-sub">
            <span>${kpi.ar_count ?? 0} 笔未结清</span>
            <span>DSO <strong class="val-purple">${kpi.dso ?? 0}</strong> 天</span>
          </div>
        </div>
      </div>

      <div class="sci-grid-2">
        <div class="sci-card">
          <div class="sci-card-head">
            <span class="sci-title">月度营收 × 成本 × 毛利</span>
            <span class="sci-badge">${escHtml(yearLabel)} · 12M</span>
          </div>
          <canvas id="revCostChart" height="100"></canvas>
          <div class="sci-legend">
            <span><i style="background:#0969da"></i>营收</span>
            <span><i style="background:#cf222e"></i>生产成本</span>
            <span><i style="background:#1a7f37"></i>毛利</span>
          </div>
        </div>
        <div class="sci-card">
          <div class="sci-card-head">
            <span class="sci-title">品类收入占比</span>
            <span class="sci-badge">YTD</span>
          </div>
          <canvas id="categoryDonut" height="100"></canvas>
        </div>
      </div>

      <div class="sci-grid-2">
        <div class="sci-card">
          <div class="sci-card-head">
            <span class="sci-title">客户应收账款 TOP</span>
            <span class="sci-badge">按余额</span>
          </div>
          <table class="sci-table">
            <thead>
              <tr>
                <th>客户</th>
                <th>余额</th>
                <th>账期</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>${arRows}</tbody>
          </table>
          <div class="sci-mini-stats">
            <div class="sci-mini">
              <div class="label">在制任务</div>
              <div class="num val-blue">${kpi.production_active ?? 0}</div>
            </div>
            <div class="sci-mini">
              <div class="label">低库存预警</div>
              <div class="num val-yellow">${kpi.low_stock ?? 0}</div>
            </div>
            <div class="sci-mini">
              <div class="label">本月回款</div>
              <div class="num val-green">${fmtMoneyInt(kpi.receipts_mtd)}</div>
            </div>
          </div>
        </div>
        <div class="sci-card">
          <div class="sci-card-head">
            <span class="sci-title">成本结构分解</span>
            <span class="sci-badge">年度估算</span>
          </div>
          ${costRows}
          <div class="sci-quick">${quickLinks}</div>
        </div>
      </div>
    </div>`;

  container.querySelectorAll(".sci-quick-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const page = btn.dataset.nav;
      if (page && typeof showPage === "function") {
        showPage(page);
        const loader = pageLoaders?.[page];
        if (loader) loader();
      }
    });
  });

  requestAnimationFrame(() => initDashboardCharts(d));
}
