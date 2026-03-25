// ===== TABIFY EXPORT ENGINE =====

function getStringLabelsForExport(doc) {
    const LABELS = {
        'standard': ['E', 'A', 'D', 'G', 'B', 'e'],
        'dropd': ['D', 'A', 'D', 'G', 'B', 'e'],
        'dadgad': ['D', 'A', 'D', 'G', 'A', 'D'],
        'openg': ['D', 'G', 'D', 'G', 'B', 'D'],
        'opend': ['D', 'A', 'D', 'F#', 'A', 'D'],
    };
    if (doc.tuning === 'custom' && doc.customTuning) {
        return doc.customTuning.split(/\s+/).slice(0, 6);
    }
    return LABELS[doc.tuning] || LABELS['standard'];
}

// ===== PRINTABLE HTML EXPORT =====

function generatePrintableHTML(doc, tuningMidi) {
    const labels = getStringLabelsForExport(doc);
    const tabGrid = generateGridForPrint(doc, labels);

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${escapeHtmlForPrint(doc.title)} — Tabify</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Playfair+Display:ital,wght@0,700;1,400&family=Inter:wght@400;600&display=swap');
@page { margin: 1.5cm; size: auto; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Inter', sans-serif; color: #1a1a1a; max-width: 850px; margin: 0 auto; padding: 2rem; display: flex; flex-direction: column; align-items: center; }
h1 { font-family: 'Playfair Display', serif; font-size: 2rem; margin-bottom: 0.25rem; text-align: center; width: 100%; }
.artist { font-size: 1.1rem; font-style: italic; color: #666; margin-bottom: 1rem; text-align: center; width: 100%; }
.meta { display: flex; flex-wrap: wrap; gap: 1.5rem; margin-bottom: 2rem; padding: 0.75rem 1rem; border: 1px solid #ddd; background: #fafafa; width: 100%; justify-content: center; }
.meta-item { display: flex; flex-direction: column; }
.meta-label { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.08em; color: #999; font-weight: 600; }
.meta-value { font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; }
.tab-section { margin-bottom: 2rem; width: 100%; }
.section-name { font-family: 'Playfair Display', serif; font-size: 1rem; font-style: italic; color: #555; margin-bottom: 0.5rem; border-bottom: 1px solid #ddd; padding-bottom: 0.25rem; text-align: left; }
.tab-line { display: flex; align-items: flex-start; margin-bottom: 2.5rem; justify-content: center; }
.section-name { padding-left: 24px; }
.string-labels { display: flex; flex-direction: column; margin-right: 4px; }
.string-label { height: 28px; display: flex; align-items: center; justify-content: flex-end; font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; font-weight: 600; color: #666; padding-right: 3px; width: 20px; }
.measures-row { display: flex; }
.measure { display: flex; flex-direction: column; border-left: 2px solid #1a1a1a; border-right: 2px solid #1a1a1a; position: relative; }
.measure-num { position: absolute; bottom: -20px; left: 0; right: 0; text-align: center; font-family: 'JetBrains Mono', monospace; font-size: 0.65rem; font-weight: 500; color: #666; border-left: 1px solid #999; border-right: 1px solid #999; border-bottom: 1px solid #999; padding: 1px 0; line-height: 1; }
.measure-string { display: flex; height: 28px; position: relative; }
.measure-string::after { content: ''; position: absolute; top: 50%; left: 0; right: 0; height: 0; border-top: 1px solid #333; z-index: 0; transform: translateY(-0.5px); }
.cell { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; position: relative; z-index: 1; font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; font-weight: 500; }
.cell-note { position: relative; z-index: 2; padding: 0 2px; min-width: 10px; text-align: center; line-height: 28px; }
.cell-note:not(:empty) { background: #fff; }
.cell .tech { position: absolute; top: -2px; left: 50%; transform: translateX(-50%); font-size: 0.45rem; color: #8e44ad; font-family: 'JetBrains Mono', monospace; font-weight: 600; z-index: 3; padding: 0 1px; line-height: 1; }
.cell .tech:not(.tech-between) { background: #fff; }
.cell .tech-between { top: 50%; left: -2px; transform: translate(-50%, -50%); font-size: 0.6rem; }
.cell .lh { position: absolute; top: 2px; left: 0; font-size: 0.4rem; color: #27ae60; font-family: 'JetBrains Mono', monospace; font-weight: 600; z-index: 3; line-height: 1; }
.cell .rh { position: absolute; top: 2px; right: 0; font-size: 0.4rem; color: #2980b9; font-family: 'JetBrains Mono', monospace; font-weight: 600; z-index: 3; line-height: 1; }
.beat-sep { position: absolute; top: 0; bottom: 0; width: 1px; background: #e0ddd6; z-index: 0; left: -1px; }
.footer { margin-top: 2rem; padding-top: 0.5rem; border-top: 1px solid #ddd; font-size: 0.7rem; color: #aaa; text-align: center; width: 100%; }
@media print {
  body { padding: 0; }
  .no-print { display: none; }
}
</style>
</head>
<body>
<h1>${escapeHtmlForPrint(doc.title)}</h1>
${doc.artist ? `<p class="artist">${escapeHtmlForPrint(doc.artist)}</p>` : ''}
<div class="meta">
${doc.key ? `<div class="meta-item"><span class="meta-label">Key</span><span class="meta-value">${escapeHtmlForPrint(doc.key)}</span></div>` : ''}
<div class="meta-item"><span class="meta-label">BPM</span><span class="meta-value">${doc.bpm || 120}</span></div>
<div class="meta-item"><span class="meta-label">Time</span><span class="meta-value">${escapeHtmlForPrint(doc.timeSig || '4/4')}</span></div>
${doc.capo ? `<div class="meta-item"><span class="meta-label">Capo</span><span class="meta-value">Fret ${doc.capo}</span></div>` : ''}
<div class="meta-item"><span class="meta-label">Tuning</span><span class="meta-value">${escapeHtmlForPrint(labels.join(' '))}</span></div>
</div>
${tabGrid}
<div class="footer">Generated by Tabify</div>
</body>
</html>`;
}

function generateGridForPrint(doc, labels) {
    let html = '';
    let globalMeasure = 0;
    const subdivisions = doc.subdivisions || 4;
    const aboveTechs = ['b', '~', 'x'];

    doc.sections.forEach(section => {
        html += '<div class="tab-section">';
        if (section.name) {
            html += `<div class="section-name">${escapeHtmlForPrint(section.name)}</div>`;
        }

        const measuresPerLine = 4;
        for (let lineStart = 0; lineStart < section.measures.length; lineStart += measuresPerLine) {
            const lineEnd = Math.min(lineStart + measuresPerLine, section.measures.length);

            html += '<div class="tab-line">';

            // String labels
            html += '<div class="string-labels">';
            for (let s = 0; s < 6; s++) {
                html += `<div class="string-label">${escapeHtmlForPrint(labels[5 - s])}</div>`;
            }
            html += '</div>';

            // Measures
            html += '<div class="measures-row">';
            for (let mi = lineStart; mi < lineEnd; mi++) {
                const measure = section.measures[mi];
                globalMeasure++;
                html += `<div class="measure"><div class="measure-num">${globalMeasure}</div>`;

                for (let s = 0; s < 6; s++) {
                    const stringIdx = 5 - s;
                    html += '<div class="measure-string">';

                    for (let ci = 0; ci < measure.columns.length; ci++) {
                        const col = measure.columns[ci];
                        const note = col.notes[stringIdx];
                        const tech = col.techniques ? col.techniques[stringIdx] : null;
                        const lhFinger = col.lhFingers ? col.lhFingers[stringIdx] : null;
                        const rhFinger = col.fingers ? col.fingers[stringIdx] : null;

                        html += '<div class="cell">';

                        // Beat separator
                        if (ci > 0 && ci % subdivisions === 0) {
                            html += '<div class="beat-sep"></div>';
                        }

                        // Technique
                        if (tech) {
                            if (tech === '<>') {
                                html += `<span class="cell-note">&lt;${note !== null ? note : ''}&gt;</span>`;
                            } else if (/^<\d+>$/.test(tech)) {
                                // Artificial harmonic: fret + harmonic node e.g. 2<7>
                                const node = tech.slice(1, -1);
                                html += `<span class="cell-note">${note !== null ? note : ''}&lt;${node}&gt;</span>`;
                            } else {
                                const techClass = aboveTechs.includes(tech) ? 'tech' : 'tech tech-between';
                                html += `<span class="${techClass}">${escapeHtmlForPrint(tech)}</span>`;
                                html += `<span class="cell-note">${note !== null ? note : ''}</span>`;
                            }
                        } else {
                            html += `<span class="cell-note">${note !== null ? note : ''}</span>`;
                        }

                        // Finger annotations
                        if (lhFinger) html += `<span class="lh">${lhFinger}</span>`;
                        if (rhFinger) html += `<span class="rh">${rhFinger}</span>`;

                        html += '</div>';
                    }

                    html += '</div>';
                }

                html += '</div>';
            }
            html += '</div>';

            html += '</div>';
        }

        html += '</div>';
    });

    return html;
}

function escapeHtmlForPrint(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
