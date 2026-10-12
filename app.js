let globalData = null;
let currentHorizon = '1D';

// 頁面加載時自動讀取 data.json
document.addEventListener('DOMContentLoaded', () => {
    fetch('data.json')
        .then(res => res.json())
        .then(data => {
            globalData = data;
            initDashboard();
        })
        .catch(err => {
            console.error("Failed to load data.json:", err);
            alert("data.json 載入失敗，請確認檔案位置或是否啟動 Local Server。");
        });
});

function initDashboard() {
    // 1. 設定 Header 資訊
    document.getElementById('study-period').innerText = `Study Period: ${globalData.study_period || 'N/A'}`;
    document.getElementById('data-source').innerText = `Source: ${globalData.data_source || 'CSV'}`;

    // 2. 渲染各模組
    updatePredictionOverview();
    renderMarkowitzChart();
    renderPCAChart();
    renderTable();
}

// 切換 Horizon 天數
function changeHorizon(horizon) {
    currentHorizon = horizon;
    
    // 更新畫面上所有的 current-h-label 標籤
    document.querySelectorAll('.current-h-label').forEach(el => el.innerText = horizon);

    // 更新按鈕 active 樣式
    document.querySelectorAll('.horizon-btn').forEach(btn => {
        if (btn.dataset.h === horizon) {
            btn.className = "horizon-btn px-3 py-1.5 rounded-lg text-xs font-semibold transition bg-blue-600 text-white shadow-sm";
        } else {
            btn.className = "horizon-btn px-3 py-1.5 rounded-lg text-xs font-semibold transition text-slate-600 hover:text-blue-600";
        }
    });

    // 重新更新預測卡片與表格
    updatePredictionOverview();
    renderTable();
}

// 區塊一：預測數據總覽與 Top Movers
function updatePredictionOverview() {
    const companies = globalData.companies;
    const grid = document.getElementById('prediction-grid');
    grid.innerHTML = '';

    let maxReturn = -Infinity;
    let topGainer = null;
    let totalReturn = 0;
    let positiveCount = 0;

    companies.forEach(comp => {
        const val = comp.predictions[currentHorizon] || 0;
        totalReturn += val;
        if (val > 0) positiveCount++;

        if (val > maxReturn) {
            maxReturn = val;
            topGainer = comp;
        }

        // 渲染 50 家公司的微型卡片
        const card = document.createElement('div');
        const isPositive = val >= 0;
        const colorClass = isPositive ? 'text-emerald-600 bg-emerald-50/60 border-emerald-200' : 'text-rose-600 bg-rose-50/60 border-rose-200';

        card.className = `p-2 rounded-xl border text-center transition hover:shadow-md cursor-pointer ${colorClass}`;

        card.innerHTML = `
            <p class="text-[10px] font-bold text-slate-500 truncate" title="${comp.name}">
                ${comp.name}
            </p>
            <p class="text-xs font-mono font-extrabold mt-0.5">
                ${isPositive ? '+' : ''}${val}%
            </p>
        `;
        
        card.onclick = () => scrollToCompany(comp.ticker);
        
        grid.appendChild(card);
    });

    // 更新 KPI 數據
    if (topGainer) {
        document.getElementById('top-gainer-val').innerText = `+${maxReturn}%`;
        document.getElementById('top-gainer-name').innerText = `${topGainer.name} (${topGainer.ticker})`;
    }
    const avgReturn = (totalReturn / companies.length).toFixed(2);
    document.getElementById('avg-return-val').innerText = `${avgReturn >= 0 ? '+' : ''}${avgReturn}%`;
    document.getElementById('positive-ratio-val').innerText = `${positiveCount} / ${companies.length} (${((positiveCount/companies.length)*100).toFixed(0)}%)`;
}

/* 取得產業顏色映射表（白藍綠視覺系配色）
function getIndustryColorMap(industries) {
    const palette = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#64748b'];
    const map = {};
    const unique = [...new Set(industries)];
    unique.forEach((ind, i) => {
        map[ind] = palette[i % palette.length];
    });
    return map;
}

// 區塊二：Markowitz Return-Risk 圖表（依產業分色）
function renderMarkowitzChart() {
    const companies = globalData.companies;
    const industries = companies.map(c => c.industry || 'Other');
    const colorMap = getIndustryColorMap(industries);

    // Grouping by Industry for Plotly legend
    const grouped = {};
    companies.forEach(c => {
        const ind = c.industry || 'Other';
        if (!grouped[ind]) grouped[ind] = [];
        grouped[ind].push(c);
    });

    const traces = Object.keys(grouped).map(ind => {
        const comps = grouped[ind];
        return {
            name: ind,
            x: comps.map(c => c.return_risk.volatility),
            y: comps.map(c => c.return_risk.expected_return),
            text: comps.map(c => `${c.name} (${c.ticker})`),
            mode: 'markers',
            marker: { size: 9, color: colorMap[ind], opacity: 0.85 },
            hovertemplate: '<b>%{text}</b><br>Volatility: %{x}<br>Return: %{y}%<extra></extra>'
        };
    });

    const layout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        margin: { l: 45, r: 15, t: 10, b: 40 },
        xaxis: { title: { text: 'Volatility (Risk)', font: { size: 11, color: '#64748b' } }, gridcolor: '#f1f5f9' },
        yaxis: { title: { text: 'Expected Return (%)', font: { size: 11, color: '#64748b' } }, gridcolor: '#f1f5f9' },
        legend: { orientation: 'h', y: -0.2, font: { size: 10, color: '#64748b' } },
        hovermode: 'closest'
    };

    Plotly.newPlot('markowitz-chart', traces, layout, {responsive: true, displayModeBar: false});
}

// 區塊二：PCA 圖表（依產業分色）
function renderPCAChart() {
    const companies = globalData.companies;
    const industries = companies.map(c => c.industry || 'Other');
    const colorMap = getIndustryColorMap(industries);

    const grouped = {};
    companies.forEach(c => {
        const ind = c.industry || 'Other';
        if (!grouped[ind]) grouped[ind] = [];
        grouped[ind].push(c);
    });

    const traces = Object.keys(grouped).map(ind => {
        const comps = grouped[ind];
        return {
            name: ind,
            x: comps.map(c => c.pca.pc1),
            y: comps.map(c => c.pca.pc2),
            text: comps.map(c => `${c.name} (${c.ticker})`),
            mode: 'markers',
            marker: { size: 9, color: colorMap[ind], opacity: 0.85 },
            hovertemplate: '<b>%{text}</b><br>PC1: %{x}<br>PC2: %{y}<extra></extra>'
        };
    });

    const layout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        margin: { l: 45, r: 15, t: 10, b: 40 },
        xaxis: { title: { text: 'Principal Component 1', font: { size: 11, color: '#64748b' } }, gridcolor: '#f1f5f9' },
        yaxis: { title: { text: 'Principal Component 2', font: { size: 11, color: '#64748b' } }, gridcolor: '#f1f5f9' },
        showlegend: false,
        hovermode: 'closest'
    };

    Plotly.newPlot('pca-chart', traces, layout, {responsive: true, displayModeBar: false});
}*/

// 取得產業顏色映射表
function getIndustryColorMap(industries) {
    const palette = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#64748b'];
    const map = {};
    const unique = [...new Set(industries)];
    unique.forEach((ind, i) => {
        map[ind] = palette[i % palette.length];
    });
    return map;
}

// 區塊二：Markowitz Return-Risk 圖表
function renderMarkowitzChart() {
    const companies = globalData.companies;
    const industries = companies.map(c => c.industry || 'Other');
    const uniqueIndustries = [...new Set(industries)];
    const colorMap = getIndustryColorMap(industries);

    // 依據固定順序建立 Trace，確保與 PCA 圖表索引一致
    const traces = uniqueIndustries.map(ind => {
        const comps = companies.filter(c => (c.industry || 'Other') === ind);
        return {
            name: ind,
            x: comps.map(c => c.return_risk.volatility),
            y: comps.map(c => c.return_risk.expected_return),
            text: comps.map(c => `${c.name} (${c.ticker})`),
            mode: 'markers',
            marker: { size: 9, color: colorMap[ind], opacity: 0.85 },
            hovertemplate: '<b>%{text}</b><br>Volatility: %{x}<br>Return: %{y}%<extra></extra>'
        };
    });

    const layout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        margin: { l: 45, r: 15, t: 10, b: 60 }, // 加大下邊距給圖例
        xaxis: { title: { text: 'Volatility (Risk)', font: { size: 11, color: '#64748b' } }, gridcolor: '#f1f5f9' },
        yaxis: { title: { text: 'Expected Return (%)', font: { size: 11, color: '#64748b' } }, gridcolor: '#f1f5f9' },
        legend: { orientation: 'h', y: -0.35, font: { size: 10, color: '#64748b' } },
        hovermode: 'closest'
    };

    Plotly.newPlot('markowitz-chart', traces, layout, {responsive: true, displayModeBar: false})
        .then(() => setupChartSync()); // 圖表渲染完成後綁定連動事件
}

// 區塊二：PCA 圖表
function renderPCAChart() {
    const companies = globalData.companies;
    const industries = companies.map(c => c.industry || 'Other');
    const uniqueIndustries = [...new Set(industries)];
    const colorMap = getIndustryColorMap(industries);

    const traces = uniqueIndustries.map(ind => {
        const comps = companies.filter(c => (c.industry || 'Other') === ind);
        return {
            name: ind,
            x: comps.map(c => c.pca.pc1),
            y: comps.map(c => c.pca.pc2),
            text: comps.map(c => `${c.name} (${c.ticker})`),
            mode: 'markers',
            marker: { size: 9, color: colorMap[ind], opacity: 0.85 },
            hovertemplate: '<b>%{text}</b><br>PC1: %{x}<br>PC2: %{y}<extra></extra>'
        };
    });

    const layout = {
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        margin: { l: 45, r: 15, t: 10, b: 60 },
        xaxis: { title: { text: 'Principal Component 1', font: { size: 11, color: '#64748b' } }, gridcolor: '#f1f5f9' },
        yaxis: { title: { text: 'Principal Component 2', font: { size: 11, color: '#64748b' } }, gridcolor: '#f1f5f9' },
        showlegend: false, // 圖例由 Markowitz 圖表統一呈現與操作
        hovermode: 'closest'
    };

    Plotly.newPlot('pca-chart', traces, layout, {responsive: true, displayModeBar: false});
}

// 雙圖連動處理邏輯
function setupChartSync() {
    const markowitzEl = document.getElementById('markowitz-chart');
    const pcaEl = document.getElementById('pca-chart');

    if (!markowitzEl || !pcaEl) return;

    let clickTimer = null;

    // 監聽單擊事件，並用定時器模擬區分雙擊
    markowitzEl.on('plotly_legendclick', function(data) {
        const targetIndex = data.curveNumber;

        if (clickTimer) {
            // ---- 觸發「雙擊」邏輯 ----
            clearTimeout(clickTimer);
            clickTimer = null;

            const totalTraces = markowitzEl.data.length;
            // 檢查是否目前已經是「只顯示當前項目」
            const isIsolated = markowitzEl.data.every((t, i) => 
                i === targetIndex ? (t.visible !== 'legendonly') : (t.visible === 'legendonly')
            );

            // 如果已經獨占 -> 恢復全部顯示 (true)；如果不是 -> 全部隱藏 (legendonly) 僅目標顯示
            const newVisibilities = Array(totalTraces).fill(isIsolated ? true : 'legendonly');
            if (!isIsolated) newVisibilities[targetIndex] = true;

            Plotly.restyle('markowitz-chart', { visible: newVisibilities });
            Plotly.restyle('pca-chart', { visible: newVisibilities });

        } else {
            // ---- 設定計時器，等待是否會有第二次點擊（預設 250ms） ----
            clickTimer = setTimeout(() => {
                clickTimer = null;

                // ---- 觸發「單擊」邏輯 ----
                const currentVis = markowitzEl.data[targetIndex].visible;
                const nextVis = (currentVis === 'legendonly') ? true : 'legendonly';

                Plotly.restyle('markowitz-chart', { visible: nextVis }, [targetIndex]);
                Plotly.restyle('pca-chart', { visible: nextVis }, [targetIndex]);
            }, 250);
        }

        return false; // 阻擋 Plotly 原生事件干擾
    });
}

// 區塊三：渲染詳細指標表格
function renderTable() {
    const tbody = document.getElementById('company-table-body');
    tbody.innerHTML = '';

    globalData.companies.forEach(comp => {
        const predVal = comp.predictions[currentHorizon] || 0;
        const isPositive = predVal >= 0;
        const badgeColor = isPositive ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-rose-700 bg-rose-50 border-rose-200';

        const tr = document.createElement('tr');
        tr.id = `company-${comp.ticker}`;
        tr.className = "hover:bg-slate-50/80 transition company-row";
        tr.dataset.search = `${comp.name} ${comp.ticker} ${comp.industry}`.toLowerCase();

        tr.innerHTML = `
            <td class="p-3 font-medium text-slate-900 flex items-center gap-2.5">
                <div class="w-7 h-7 rounded-full bg-blue-50 text-blue-600 font-bold text-xs flex items-center justify-center border border-blue-100">
                    ${comp.ticker.substring(0, 2)}
                </div>
                <span>${comp.name}</span>
            </td>
            <td class="p-3 text-slate-500 font-mono text-xs">${comp.full_ticker}</td>
            <td class="p-3 text-slate-600">
                <span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs">${comp.industry}</span>
            </td>
            <td class="p-3 text-slate-700 font-mono text-xs">${comp.market_cap}</td>
            <td class="p-3 text-right text-slate-700 font-mono text-xs">${comp.return_risk.expected_return}%</td>
            <td class="p-3 text-right text-slate-700 font-mono text-xs">${comp.return_risk.volatility}</td>
            <td class="p-3 text-right">
                <span class="px-2.5 py-1 rounded-md border font-mono text-xs font-bold ${badgeColor}">
                    ${isPositive ? '+' : ''}${predVal}%
                </span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 表格即時搜尋過濾
function filterTable() {
    const query = document.getElementById('table-search').value.toLowerCase();
    const rows = document.querySelectorAll('.company-row');
    rows.forEach(row => {
        const text = row.dataset.search;
        row.style.display = text.includes(query) ? '' : 'none';
    });
}

// 點擊上方公司卡片後，跳轉到下方對應公司的詳細資料
function scrollToCompany(ticker) {
    const row = document.getElementById(`company-${ticker}`);

    if (!row) return;

    // 平滑捲動到該公司
    row.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
    });

    // 加上醒目效果
    row.classList.add('company-highlight');

    // 1.5 秒後移除醒目效果
    setTimeout(() => {
        row.classList.remove('company-highlight');
    }, 1500);
}
