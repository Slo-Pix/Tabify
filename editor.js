// ===== TABIFY EDITOR ENGINE =====

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const INTERVAL_NAMES = ['R', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];

const SCALES = {
    'none': null,
    'major': [0, 2, 4, 5, 7, 9, 11],
    'minor': [0, 2, 3, 5, 7, 8, 10],
    'pentatonic-major': [0, 2, 4, 7, 9],
    'pentatonic-minor': [0, 3, 5, 7, 10],
    'blues': [0, 3, 5, 6, 7, 10],
    'dorian': [0, 2, 3, 5, 7, 9, 10],
    'mixolydian': [0, 2, 4, 5, 7, 9, 10],
    'harmonic-minor': [0, 2, 3, 5, 7, 8, 11],
    'phrygian': [0, 1, 3, 5, 7, 8, 10],
};

const TUNINGS = {
    'standard': [40, 45, 50, 55, 59, 64],
    'dropd':    [38, 45, 50, 55, 59, 64],
    'dadgad':   [38, 45, 50, 55, 57, 62],
    'openg':    [38, 43, 50, 55, 59, 62],
    'opend':    [38, 45, 50, 54, 57, 62],
};

const TUNING_LABELS = {
    'standard': ['E', 'A', 'D', 'G', 'B', 'e'],
    'dropd':    ['D', 'A', 'D', 'G', 'B', 'e'],
    'dadgad':   ['D', 'A', 'D', 'G', 'A', 'D'],
    'openg':    ['D', 'G', 'D', 'G', 'B', 'D'],
    'opend':    ['D', 'A', 'D', 'F#', 'A', 'D'],
};

const HARMONIC_NODES = {
    3: { ratio: '1/6', interval: 31 },
    4: { ratio: '1/5', interval: 28 },
    5: { ratio: '1/4', interval: 24 },
    7: { ratio: '1/3', interval: 19 },
    12: { ratio: '1/2', interval: 12 },
    19: { ratio: '1/3', interval: 19 },
    24: { ratio: '1/4', interval: 24 },
};

// ===== TAB DOCUMENT MODEL =====

function createEmptyMeasure(beatsPerMeasure, subdivisions) {
    const cols = beatsPerMeasure * subdivisions;
    const columns = [];
    for (let i = 0; i < cols; i++) {
        columns.push({
            notes: [null, null, null, null, null, null],
            techniques: [null, null, null, null, null, null],
            fingers: [null, null, null, null, null, null],
            lhFingers: [null, null, null, null, null, null],
        });
    }
    return { columns };
}

function createDefaultDocument() {
    const beatsPerMeasure = 4;
    const subdivisions = 4; // 16th note grid
    return {
        title: 'Untitled',
        artist: '',
        tuning: 'standard',
        customTuning: null,
        capo: 0,
        key: '',
        bpm: 120,
        timeSig: '4/4',
        beatsPerMeasure,
        subdivisions,
        sections: [
            {
                name: 'Intro',
                measures: [
                    createEmptyMeasure(beatsPerMeasure, subdivisions),
                    createEmptyMeasure(beatsPerMeasure, subdivisions),
                    createEmptyMeasure(beatsPerMeasure, subdivisions),
                    createEmptyMeasure(beatsPerMeasure, subdivisions),
                ],
            }
        ],
    };
}

// ===== STATE =====

let doc = createDefaultDocument();
let cursor = { section: 0, measure: 0, col: 0, string: 0 };
let activeTechnique = null;
let activeFinger = null;  // { hand: 'rh'|'lh', value: 'P'|'I'|'M'|'A'|'C'|'1'|'2'|'3'|'4' } or null
let inputBuffer = '';
let inputTimeout = null;

// ===== UNDO / REDO =====

const undoStack = [];
const redoStack = [];
const MAX_UNDO = 50;

function cloneDoc(d) {
    return JSON.parse(JSON.stringify(d));
}

function pushUndo() {
    undoStack.push(cloneDoc(doc));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0; // clear redo on new action
}

function undo() {
    if (undoStack.length === 0) return;
    redoStack.push(cloneDoc(doc));
    doc = undoStack.pop();
    clampCursor();
    render();
}

function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(cloneDoc(doc));
    doc = redoStack.pop();
    clampCursor();
    render();
}

function clampCursor() {
    if (cursor.section >= doc.sections.length) cursor.section = doc.sections.length - 1;
    const sec = doc.sections[cursor.section];
    if (cursor.measure >= sec.measures.length) cursor.measure = sec.measures.length - 1;
    const m = sec.measures[cursor.measure];
    if (cursor.col >= m.columns.length) cursor.col = m.columns.length - 1;
    if (cursor.string > 5) cursor.string = 5;
    if (cursor.string < 0) cursor.string = 0;
}

// ===== CLIPBOARD (measures/sections) =====

let clipboard = null; // { type: 'measure'|'section', data: ... }

function copyMeasure() {
    const sec = doc.sections[cursor.section];
    if (!sec) return;
    clipboard = { type: 'measure', data: cloneDoc(sec.measures[cursor.measure]) };
}

function copySection() {
    const sec = doc.sections[cursor.section];
    if (!sec) return;
    clipboard = { type: 'section', data: cloneDoc(sec) };
}

function pasteMeasure() {
    if (!clipboard || clipboard.type !== 'measure') return;
    pushUndo();
    const sec = doc.sections[cursor.section];
    sec.measures.splice(cursor.measure + 1, 0, cloneDoc(clipboard.data));
    cursor.measure++;
    cursor.col = 0;
    render();
}

function pasteSection() {
    if (!clipboard) return;
    pushUndo();
    if (clipboard.type === 'section') {
        doc.sections.splice(cursor.section + 1, 0, cloneDoc(clipboard.data));
    } else if (clipboard.type === 'measure') {
        // Paste measure as a new single-measure section
        doc.sections.splice(cursor.section + 1, 0, {
            name: 'Pasted',
            measures: [cloneDoc(clipboard.data)]
        });
    }
    render();
}

function moveSectionUp(idx) {
    if (idx <= 0) return;
    pushUndo();
    const temp = doc.sections[idx];
    doc.sections[idx] = doc.sections[idx - 1];
    doc.sections[idx - 1] = temp;
    if (cursor.section === idx) cursor.section--;
    else if (cursor.section === idx - 1) cursor.section++;
    render();
}

function moveSectionDown(idx) {
    if (idx >= doc.sections.length - 1) return;
    pushUndo();
    const temp = doc.sections[idx];
    doc.sections[idx] = doc.sections[idx + 1];
    doc.sections[idx + 1] = temp;
    if (cursor.section === idx) cursor.section++;
    else if (cursor.section === idx + 1) cursor.section--;
    render();
}

// ===== RENDERING =====

function getStringLabels() {
    if (doc.tuning === 'custom' && doc.customTuning) {
        return doc.customTuning.split(/\s+/).slice(0, 6);
    }
    return TUNING_LABELS[doc.tuning] || TUNING_LABELS['standard'];
}

function render() {
    const canvas = document.getElementById('tab-canvas');
    canvas.innerHTML = '';

    const labels = getStringLabels();

    doc.sections.forEach((section, si) => {
        const sectionEl = document.createElement('div');
        sectionEl.className = 'tab-section';
        sectionEl.dataset.section = si;

        // Section header
        const header = document.createElement('div');
        header.className = 'section-header';
        header.innerHTML = `
            <span class="section-label">${escapeHtml(section.name)}</span>
            <div class="section-line"></div>
            <button class="section-move-up" data-section="${si}" title="Move section up">&uarr;</button>
            <button class="section-move-down" data-section="${si}" title="Move section down">&darr;</button>
            <button class="section-copy" data-section="${si}" title="Copy section">copy</button>
            <button class="section-delete" data-section="${si}" title="Delete section">&times;</button>
        `;
        sectionEl.appendChild(header);

        // Break measures into lines (max ~4 measures per line for readability)
        const measuresPerLine = 4;
        for (let lineStart = 0; lineStart < section.measures.length; lineStart += measuresPerLine) {
            const lineEnd = Math.min(lineStart + measuresPerLine, section.measures.length);

            const lineEl = document.createElement('div');
            lineEl.className = 'tab-line';

            // String labels column
            const labelsCol = document.createElement('div');
            labelsCol.className = 'tab-string-labels';
            for (let s = 0; s < 6; s++) {
                const lbl = document.createElement('div');
                lbl.className = 'tab-string-label';
                lbl.textContent = labels[5 - s]; // reverse: high string on top
                labelsCol.appendChild(lbl);
            }
            lineEl.appendChild(labelsCol);

            // Measures container
            const measuresRow = document.createElement('div');
            measuresRow.className = 'tab-measures-row';

            for (let mi = lineStart; mi < lineEnd; mi++) {
                const measure = section.measures[mi];
                const measureEl = document.createElement('div');
                measureEl.className = 'tab-measure';
                if (cursor.section === si && cursor.measure === mi) {
                    measureEl.classList.add('selected');
                }

                // Measure number
                const mNum = document.createElement('div');
                mNum.className = 'measure-number';
                let globalMeasure = 0;
                for (let ps = 0; ps < si; ps++) globalMeasure += doc.sections[ps].measures.length;
                globalMeasure += mi + 1;
                mNum.textContent = globalMeasure;
                measureEl.appendChild(mNum);

                // 6 strings (high to low visually = index 5..0 in data)
                for (let displayRow = 0; displayRow < 6; displayRow++) {
                    const stringIdx = 5 - displayRow; // string 5 (high e) on top
                    const stringRow = document.createElement('div');
                    stringRow.className = 'tab-measure-string';

                    for (let ci = 0; ci < measure.columns.length; ci++) {
                        const col = measure.columns[ci];
                        const cell = document.createElement('div');
                        cell.className = 'beat-cell';
                        cell.dataset.section = si;
                        cell.dataset.measure = mi;
                        cell.dataset.col = ci;
                        cell.dataset.string = stringIdx;

                        // Cursor highlight
                        if (si === cursor.section && mi === cursor.measure && ci === cursor.col && stringIdx === cursor.string) {
                            cell.classList.add('cursor-active');
                        }

                        // Note content
                        const content = document.createElement('span');
                        content.className = 'cell-content';
                        const noteVal = col.notes[stringIdx];
                        if (noteVal !== null) {
                            content.textContent = noteVal;
                        }
                        cell.appendChild(content);

                        // Technique marker
                        const tech = col.techniques[stringIdx];
                        if (tech) {
                            if (tech === '<>') {
                                // Natural harmonics: wrap fret number like <12>
                                const fretVal = noteVal !== null ? noteVal : '';
                                content.textContent = '<' + fretVal + '>';
                            } else if (/^<\d+>$/.test(tech)) {
                                // Artificial harmonics: fret + harmonic node like 2<7>
                                const fretVal = noteVal !== null ? noteVal : '';
                                content.textContent = fretVal + tech;
                            } else {
                                const marker = document.createElement('span');
                                const aboveTechs = ['b', '~', 'x'];
                                if (aboveTechs.includes(tech)) {
                                    marker.className = 'tech-marker';
                                } else {
                                    marker.className = 'tech-marker tech-between';
                                }
                                marker.textContent = tech;
                                cell.appendChild(marker);
                            }
                        }

                        // LH finger marker (above, next to technique)
                        const lhFinger = col.lhFingers ? col.lhFingers[stringIdx] : null;
                        if (lhFinger) {
                            const marker = document.createElement('span');
                            marker.className = 'lh-finger-marker';
                            marker.textContent = lhFinger;
                            cell.appendChild(marker);
                        }

                        // RH finger marker (below)
                        const finger = col.fingers[stringIdx];
                        if (finger) {
                            const marker = document.createElement('span');
                            marker.className = 'finger-marker';
                            marker.textContent = finger;
                            cell.appendChild(marker);
                        }

                        // Beat separator indicator
                        if (ci > 0 && ci % doc.subdivisions === 0) {
                            const sep = document.createElement('div');
                            sep.className = 'beat-sep';
                            sep.style.left = '-1px';
                            cell.appendChild(sep);
                        }

                        stringRow.appendChild(cell);
                    }

                    measureEl.appendChild(stringRow);
                }

                measuresRow.appendChild(measureEl);
            }

            lineEl.appendChild(measuresRow);
            sectionEl.appendChild(lineEl);
        }

        canvas.appendChild(sectionEl);
    });

    updateStatusBar();
    scrollCursorIntoView();
}

function updateStatusBar() {
    const cursorInfo = document.getElementById('status-cursor');
    let globalMeasure = 0;
    for (let i = 0; i < cursor.section; i++) globalMeasure += doc.sections[i].measures.length;
    globalMeasure += cursor.measure + 1;
    const beat = Math.floor(cursor.col / doc.subdivisions) + 1;
    const sub = (cursor.col % doc.subdivisions) + 1;
    const stringNames = getStringLabels();
    const sName = stringNames[cursor.string] || (cursor.string + 1);
    const sectionName = doc.sections[cursor.section]?.name || '';
    cursorInfo.textContent = `${sectionName} · Measure ${globalMeasure} · Beat ${beat}.${sub} · String ${sName}`;
}

function scrollCursorIntoView() {
    const active = document.querySelector('.beat-cell.cursor-active');
    if (active) {
        active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
}

// ===== CURSOR NAVIGATION =====

function moveCursor(dir) {
    const sec = doc.sections[cursor.section];
    const measure = sec.measures[cursor.measure];

    switch (dir) {
        case 'right':
            if (cursor.col < measure.columns.length - 1) {
                cursor.col++;
            } else if (cursor.measure < sec.measures.length - 1) {
                cursor.measure++;
                cursor.col = 0;
            } else if (cursor.section < doc.sections.length - 1) {
                cursor.section++;
                cursor.measure = 0;
                cursor.col = 0;
            }
            break;
        case 'left':
            if (cursor.col > 0) {
                cursor.col--;
            } else if (cursor.measure > 0) {
                cursor.measure--;
                cursor.col = doc.sections[cursor.section].measures[cursor.measure].columns.length - 1;
            } else if (cursor.section > 0) {
                cursor.section--;
                const prevSec = doc.sections[cursor.section];
                cursor.measure = prevSec.measures.length - 1;
                cursor.col = prevSec.measures[cursor.measure].columns.length - 1;
            }
            break;
        case 'up':
            if (cursor.string < 5) cursor.string++;
            break;
        case 'down':
            if (cursor.string > 0) cursor.string--;
            break;
    }
}

// ===== EDITING =====

function getCurrentCell() {
    const sec = doc.sections[cursor.section];
    if (!sec) return null;
    const measure = sec.measures[cursor.measure];
    if (!measure) return null;
    return measure.columns[cursor.col];
}

function setNote(value) {
    const cell = getCurrentCell();
    if (!cell) return;
    pushUndo();
    cell.notes[cursor.string] = value;
    if (activeTechnique) {
        cell.techniques[cursor.string] = activeTechnique;
    }
    if (activeFinger) {
        if (activeFinger.hand === 'rh') {
            cell.fingers[cursor.string] = activeFinger.value;
        } else {
            if (!cell.lhFingers) cell.lhFingers = [null, null, null, null, null, null];
            cell.lhFingers[cursor.string] = activeFinger.value;
        }
    }
}

function clearNote() {
    const cell = getCurrentCell();
    if (!cell) return;
    pushUndo();
    cell.notes[cursor.string] = null;
    cell.techniques[cursor.string] = null;
    cell.fingers[cursor.string] = null;
    if (cell.lhFingers) cell.lhFingers[cursor.string] = null;
}

function setTechniqueOnCurrent() {
    const cell = getCurrentCell();
    if (!cell || cell.notes[cursor.string] === null) return;
    pushUndo();
    cell.techniques[cursor.string] = activeTechnique;
}

function setFingerOnCurrent() {
    const cell = getCurrentCell();
    if (!cell || cell.notes[cursor.string] === null) return;
    pushUndo();
    if (activeFinger.hand === 'rh') {
        cell.fingers[cursor.string] = activeFinger.value;
    } else {
        if (!cell.lhFingers) cell.lhFingers = [null, null, null, null, null, null];
        cell.lhFingers[cursor.string] = activeFinger.value;
    }
}

function addMeasure() {
    const sec = doc.sections[cursor.section];
    if (!sec) return;
    pushUndo();
    const newMeasure = createEmptyMeasure(doc.beatsPerMeasure, doc.subdivisions);
    sec.measures.splice(cursor.measure + 1, 0, newMeasure);
    render();
}

function deleteMeasure() {
    const sec = doc.sections[cursor.section];
    if (!sec || sec.measures.length <= 1) return;
    pushUndo();
    sec.measures.splice(cursor.measure, 1);
    if (cursor.measure >= sec.measures.length) {
        cursor.measure = sec.measures.length - 1;
    }
    cursor.col = 0;
    render();
}

function addSection(name, measureCount) {
    pushUndo();
    const measures = [];
    for (let i = 0; i < measureCount; i++) {
        measures.push(createEmptyMeasure(doc.beatsPerMeasure, doc.subdivisions));
    }
    doc.sections.push({ name, measures });
    render();
}

function deleteSection(idx) {
    if (doc.sections.length <= 1) return;
    pushUndo();
    doc.sections.splice(idx, 1);
    if (cursor.section >= doc.sections.length) {
        cursor.section = doc.sections.length - 1;
    }
    cursor.measure = 0;
    cursor.col = 0;
    render();
}

function transpose(semitones) {
    pushUndo();
    doc.sections.forEach(sec => {
        sec.measures.forEach(measure => {
            measure.columns.forEach(col => {
                col.notes = col.notes.map((n, i) => {
                    if (n === null || n === 'x') return n;
                    const val = parseInt(n);
                    if (isNaN(val)) return n;
                    const newVal = val + semitones;
                    if (newVal < 0 || newVal > 24) return n;
                    // Transpose artificial harmonic node too
                    const tech = col.techniques[i];
                    if (tech && /^<\d+>$/.test(tech)) {
                        const node = parseInt(tech.slice(1, -1));
                        const newNode = node + semitones;
                        if (newNode >= 0 && newNode <= 24) {
                            col.techniques[i] = '<' + newNode + '>';
                        }
                    }
                    return newVal;
                });
            });
        });
    });
    render();
}

// ===== SAVE / LOAD =====

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-popup';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

function saveToFile() {
    const json = JSON.stringify(doc, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const baseName = (doc.title || 'untitled').replace(/\s+/g, '_').toLowerCase();
    a.href = url;
    a.download = baseName + '.tbfy';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Saved successfully!');
}

function openFromFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const loaded = JSON.parse(e.target.result);
            doc = loaded;
            cursor = { section: 0, measure: 0, col: 0, string: 0 };

            // Sync UI
            document.getElementById('song-title').value = doc.title || '';
            document.getElementById('song-artist').value = doc.artist || '';
            document.getElementById('ed-tuning').value = doc.tuning || 'standard';
            document.getElementById('ed-capo').value = doc.capo || 0;
            document.getElementById('ed-key').value = doc.key || '';
            document.getElementById('ed-bpm').value = doc.bpm || 120;
            // Time signature: check if it's a preset or custom
            const timeSigSelect = document.getElementById('ed-time-sig');
            const timeSig = doc.timeSig || '4/4';
            const presetTimes = [...timeSigSelect.options].map(o => o.value).filter(v => v !== 'custom');
            if (presetTimes.includes(timeSig)) {
                timeSigSelect.value = timeSig;
                document.getElementById('custom-time-group').style.display = 'none';
            } else {
                timeSigSelect.value = 'custom';
                document.getElementById('custom-time-group').style.display = 'flex';
                document.getElementById('ed-custom-time').value = timeSig;
            }
            document.getElementById('custom-tuning-group').style.display = doc.tuning === 'custom' ? 'flex' : 'none';
            if (doc.customTuning) document.getElementById('ed-custom-tuning').value = doc.customTuning;

            render();
            showToast('Opened: ' + (doc.title || 'Untitled'));
        } catch (err) {
            showToast('Error: invalid .tbfy file');
        }
    };
    reader.readAsText(file);
}

// ===== FRETBOARD REFERENCE =====

function midiToNoteOnly(midi) {
    return NOTE_NAMES[((midi % 12) + 12) % 12];
}

function noteNameToMidi(name) {
    const map = { 'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11 };
    const note = name.replace(/[0-9]/g, '').trim();
    const semitone = map[note.charAt(0).toUpperCase() + note.slice(1)];
    if (semitone === undefined) return null;
    return semitone;
}

function getEditorTuningMidi() {
    if (doc.tuning === 'custom' && doc.customTuning) {
        const names = doc.customTuning.split(/\s+/).slice(0, 6);
        // Convert note names to MIDI, assuming octaves from low E upward
        const baseOctaves = [2, 2, 3, 3, 3, 4]; // E2 A2 D3 G3 B3 E4
        const result = [];
        for (let i = 0; i < 6; i++) {
            const name = names[i];
            if (!name) { result.push(TUNINGS['standard'][i]); continue; }
            const semi = noteNameToMidi(name);
            if (semi === null) { result.push(TUNINGS['standard'][i]); continue; }
            result.push(semi + (baseOctaves[i] + 1) * 12);
        }
        return result;
    }
    return TUNINGS[doc.tuning] || TUNINGS['standard'];
}

function renderEditorFretboard() {
    const panel = document.getElementById('fretboard-panel');
    if (panel.classList.contains('hidden')) return;

    const board = document.getElementById('fb-board');
    board.innerHTML = '';

    const tuning = getEditorTuningMidi();
    const scaleKey = document.getElementById('fb-scale').value;
    const rootNote = parseInt(document.getElementById('fb-root').value);
    const fretCount = parseInt(document.getElementById('fb-frets').value) || 12;
    const showHarmonics = document.getElementById('fb-harmonics').checked;
    const scaleNotes = scaleKey !== 'none' && SCALES[scaleKey]
        ? SCALES[scaleKey].map(i => (rootNote + i) % 12)
        : null;
    const harmonicFrets = [3, 4, 5, 7, 12, 19, 24];

    // Fret number row
    const numRow = document.createElement('div');
    numRow.className = 'fret-number-row';
    const emptyLbl = document.createElement('div');
    emptyLbl.className = 'string-label';
    numRow.appendChild(emptyLbl);
    for (let f = 0; f <= fretCount; f++) {
        const n = document.createElement('div');
        n.className = 'fret-number' + (f === 0 ? ' nut' : '');
        n.textContent = f === 0 ? '' : f;
        numRow.appendChild(n);
    }
    board.appendChild(numRow);

    const reversed = [...tuning].reverse();
    for (let s = 0; s < reversed.length; s++) {
        const openMidi = reversed[s];
        const row = document.createElement('div');
        row.className = 'fretboard-row';

        const label = document.createElement('div');
        label.className = 'string-label';
        label.textContent = midiToNoteOnly(openMidi);
        row.appendChild(label);

        for (let f = 0; f <= fretCount; f++) {
            const cell = document.createElement('div');
            cell.className = 'fret-cell' + (f === 0 ? ' nut' : '');
            const noteMidi = openMidi + f;
            const noteNum = noteMidi % 12;
            const noteName = midiToNoteOnly(noteMidi);

            const isHarmNode = showHarmonics && harmonicFrets.includes(f) && f > 0;

            if (isHarmNode) {
                const hData = HARMONIC_NODES[f];
                if (hData) {
                    const hMidi = openMidi + hData.interval;
                    const hNote = midiToNoteOnly(hMidi);
                    const marker = document.createElement('div');
                    marker.className = 'note-marker harmonic';
                    const span = document.createElement('span');
                    span.textContent = hNote;
                    marker.appendChild(span);
                    cell.appendChild(marker);
                }
            } else if (scaleNotes) {
                const marker = document.createElement('div');
                const isIn = scaleNotes.includes(noteNum);
                const isRoot = noteNum === rootNote;
                if (isRoot) {
                    marker.className = 'note-marker root' + (f === 0 ? ' open-string' : '');
                } else if (isIn) {
                    marker.className = 'note-marker in-scale' + (f === 0 ? ' open-string' : '');
                } else {
                    marker.className = 'note-marker out-of-scale';
                }
                marker.textContent = noteName;
                cell.appendChild(marker);
            } else {
                const marker = document.createElement('div');
                marker.className = 'note-marker in-scale' + (f === 0 ? ' open-string' : '');
                marker.textContent = noteName;
                cell.appendChild(marker);
            }

            row.appendChild(cell);
        }
        board.appendChild(row);
    }
}

// ===== EVENT HANDLERS =====

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
    // Check for URL params (from landing page "Create Arrangement")
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('title')) {
        const title = urlParams.get('title') || 'Untitled';
        const artist = urlParams.get('artist') || '';
        const bpm = parseInt(urlParams.get('bpm')) || 120;
        const key = urlParams.get('key') || '';
        const timeSig = (urlParams.get('time') || '4/4').split('+')[0].trim();
        const tuningName = urlParams.get('tuning') || 'Standard';
        const capo = parseInt(urlParams.get('capo')) || 0;

        const tuningMap = {
            'Standard': 'standard', 'Drop D': 'dropd', 'DADGAD': 'dadgad',
            'Open G': 'openg', 'Open D': 'opend',
        };
        const tuningKey = tuningMap[tuningName] || 'standard';
        const timeParts = timeSig.split('/');
        const beats = parseInt(timeParts[0]) || 4;

        doc.title = title;
        doc.artist = artist;
        doc.bpm = bpm;
        doc.key = key;
        doc.timeSig = timeSig;
        doc.beatsPerMeasure = beats;
        doc.tuning = tuningKey;
        doc.capo = capo;
        doc.sections = [
            { name: 'Intro', measures: [createEmptyMeasure(beats, doc.subdivisions), createEmptyMeasure(beats, doc.subdivisions)] },
            { name: 'Verse', measures: [createEmptyMeasure(beats, doc.subdivisions), createEmptyMeasure(beats, doc.subdivisions), createEmptyMeasure(beats, doc.subdivisions), createEmptyMeasure(beats, doc.subdivisions)] },
            { name: 'Chorus', measures: [createEmptyMeasure(beats, doc.subdivisions), createEmptyMeasure(beats, doc.subdivisions), createEmptyMeasure(beats, doc.subdivisions), createEmptyMeasure(beats, doc.subdivisions)] },
        ];

        document.getElementById('song-title').value = doc.title;
        document.getElementById('song-artist').value = doc.artist;
        document.getElementById('ed-bpm').value = doc.bpm;
        document.getElementById('ed-key').value = doc.key;
        document.getElementById('ed-time-sig').value = doc.timeSig;
        document.getElementById('ed-tuning').value = doc.tuning;
        document.getElementById('ed-capo').value = doc.capo;

        // Clean URL
        window.history.replaceState({}, '', 'editor.html');
    }

    render();

    // ---- Cell click ----
    document.getElementById('tab-canvas').addEventListener('click', (e) => {
        const cell = e.target.closest('.beat-cell');
        if (cell) {
            cursor.section = parseInt(cell.dataset.section);
            cursor.measure = parseInt(cell.dataset.measure);
            cursor.col = parseInt(cell.dataset.col);
            cursor.string = parseInt(cell.dataset.string);
            render();
            return;
        }
        // Section delete
        const delBtn = e.target.closest('.section-delete');
        if (delBtn) {
            const idx = parseInt(delBtn.dataset.section);
            if (confirm(`Delete section "${doc.sections[idx].name}"?`)) {
                deleteSection(idx);
            }
            return;
        }
        // Section move up
        const upBtn = e.target.closest('.section-move-up');
        if (upBtn) { moveSectionUp(parseInt(upBtn.dataset.section)); return; }
        // Section move down
        const downBtn = e.target.closest('.section-move-down');
        if (downBtn) { moveSectionDown(parseInt(downBtn.dataset.section)); return; }
        // Section copy
        const copyBtn = e.target.closest('.section-copy');
        if (copyBtn) {
            const idx = parseInt(copyBtn.dataset.section);
            clipboard = { type: 'section', data: cloneDoc(doc.sections[idx]) };
            document.getElementById('status-saved').textContent = 'Section copied!';
            setTimeout(() => { document.getElementById('status-saved').textContent = ''; }, 1500);
        }
    });

    // ---- Keyboard ----
    document.addEventListener('keydown', (e) => {
        // Don't capture if typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

        // Don't capture if modal is open
        if (document.querySelector('.modal-overlay:not(.hidden)')) return;

        switch (e.key) {
            case 'ArrowRight':
                e.preventDefault();
                moveCursor('right');
                render();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                moveCursor('left');
                render();
                break;
            case 'ArrowUp':
                e.preventDefault();
                moveCursor('up');
                render();
                break;
            case 'ArrowDown':
                e.preventDefault();
                moveCursor('down');
                render();
                break;
            case 'Delete':
            case 'Backspace':
                e.preventDefault();
                clearNote();
                render();
                break;
            case 'Tab':
                e.preventDefault();
                // Jump to next beat
                const jumpSize = doc.subdivisions;
                for (let i = 0; i < jumpSize; i++) moveCursor('right');
                render();
                break;
            default:
                // Number input for fret numbers (0-24)
                if (/^[0-9]$/.test(e.key)) {
                    e.preventDefault();
                    handleNumberInput(e.key);
                }
                // Technique shortcuts
                else if (e.key === 'h') { e.preventDefault(); toggleTechnique('h'); }
                else if (e.key === 'p') { e.preventDefault(); toggleTechnique('p'); }
                else if (e.key === '/') { e.preventDefault(); toggleTechnique('/'); }
                else if (e.key === '\\') { e.preventDefault(); toggleTechnique('\\'); }
                else if (e.key === 'b' && !e.ctrlKey) { e.preventDefault(); toggleTechnique('b'); }
                else if (e.key === '~') { e.preventDefault(); toggleTechnique('~'); }
                else if (e.key === 'x') { e.preventDefault(); setNote('x'); moveCursor('right'); render(); }
                break;
        }
    });

    // ---- Number input with buffer for multi-digit fret numbers ----
    function handleNumberInput(digit) {
        clearTimeout(inputTimeout);
        inputBuffer += digit;

        if (inputBuffer.length >= 2) {
            // Two digits entered, commit
            commitNumberInput();
        } else {
            // Wait briefly for second digit
            inputTimeout = setTimeout(commitNumberInput, 400);
        }
    }

    function commitNumberInput() {
        clearTimeout(inputTimeout);
        const num = parseInt(inputBuffer);
        inputBuffer = '';
        if (num >= 0 && num <= 24) {
            if (activeTechnique === '<>') {
                const cell = getCurrentCell();
                // Artificial harmonic: cell already has a natural harmonic, type again to set the node
                if (cell && cell.techniques[cursor.string] === '<>' && cell.notes[cursor.string] !== null && cell.notes[cursor.string] !== 'x') {
                    pushUndo();
                    cell.techniques[cursor.string] = '<' + num + '>';
                    moveCursor('right');
                    render();
                    return;
                }
                // Natural harmonic: first number typed — stay on cell so user can add node
                setNote(num);
                render();
                return;
            }
            setNote(num);
            moveCursor('right');
            render();
        }
    }

    // ---- Technique buttons ----
    document.querySelectorAll('.tech-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tech = btn.dataset.tech;
            toggleTechnique(tech);
        });
    });

    function toggleTechnique(tech) {
        if (activeTechnique === tech) {
            activeTechnique = null;
        } else {
            activeTechnique = tech;
        }
        updateTechButtons();

        // Apply to current cell if it has a note
        if (activeTechnique) {
            setTechniqueOnCurrent();
            render();
        }
    }

    function updateTechButtons() {
        document.querySelectorAll('.tech-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.tech === activeTechnique);
        });
    }

    // ---- Finger buttons ----
    const LH_FINGERS = ['1', '2', '3', '4'];

    document.querySelectorAll('.finger-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const finger = btn.dataset.finger;
            const hand = LH_FINGERS.includes(finger) ? 'lh' : 'rh';
            if (activeFinger && activeFinger.value === finger && activeFinger.hand === hand) {
                activeFinger = null;
            } else {
                activeFinger = { hand, value: finger };
            }
            updateFingerButtons();
            if (activeFinger) {
                setFingerOnCurrent();
                render();
            }
        });
    });

    function updateFingerButtons() {
        document.querySelectorAll('.finger-btn').forEach(b => {
            b.classList.toggle('active', activeFinger && b.dataset.finger === activeFinger.value);
        });
    }

    // ---- Song metadata sync ----
    document.getElementById('song-title').addEventListener('input', (e) => { doc.title = e.target.value; });
    document.getElementById('song-artist').addEventListener('input', (e) => { doc.artist = e.target.value; });
    document.getElementById('ed-bpm').addEventListener('change', (e) => { doc.bpm = parseInt(e.target.value) || 120; });
    document.getElementById('ed-key').addEventListener('change', (e) => { doc.key = e.target.value; });
    document.getElementById('ed-capo').addEventListener('change', (e) => { doc.capo = parseInt(e.target.value); });

    document.getElementById('ed-tuning').addEventListener('change', (e) => {
        doc.tuning = e.target.value;
        document.getElementById('custom-tuning-group').style.display = doc.tuning === 'custom' ? 'flex' : 'none';
        render();
        renderEditorFretboard();
    });

    document.getElementById('ed-custom-tuning').addEventListener('input', (e) => {
        doc.customTuning = e.target.value;
        render();
        renderEditorFretboard();
    });

    document.getElementById('ed-time-sig').addEventListener('change', (e) => {
        document.getElementById('custom-time-group').style.display = e.target.value === 'custom' ? 'flex' : 'none';
        if (e.target.value === 'custom') return;
        doc.timeSig = e.target.value;
        const parts = e.target.value.split('/');
        const beats = parseInt(parts[0]);
        doc.beatsPerMeasure = beats;
        // Don't reshape existing measures — only new ones get the new size
        render();
    });

    document.getElementById('ed-custom-time').addEventListener('input', (e) => {
        const val = e.target.value.trim();
        const match = val.match(/^(\d+)\/(\d+)$/);
        if (match && parseInt(match[1]) > 0 && parseInt(match[2]) > 0) {
            doc.timeSig = val;
            doc.beatsPerMeasure = parseInt(match[1]);
            render();
        }
    });

    // ---- Undo/Redo/Copy/Paste buttons ----
    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-redo').addEventListener('click', redo);
    document.getElementById('btn-copy-measure').addEventListener('click', () => {
        copyMeasure();
        document.getElementById('status-saved').textContent = 'Measure copied!';
        setTimeout(() => { document.getElementById('status-saved').textContent = ''; }, 1500);
    });
    document.getElementById('btn-paste-measure').addEventListener('click', pasteMeasure);

    // ---- Action buttons ----
    document.getElementById('btn-add-measure').addEventListener('click', addMeasure);
    document.getElementById('btn-del-measure').addEventListener('click', () => {
        if (confirm('Delete current measure?')) deleteMeasure();
    });

    // ---- New ----
    document.getElementById('btn-new').addEventListener('click', () => {
        if (confirm('Create a new tab? Unsaved changes will be lost.')) {
            pushUndo();
            doc = createDefaultDocument();
            cursor = { section: 0, measure: 0, col: 0, string: 0 };
            document.getElementById('song-title').value = doc.title;
            document.getElementById('song-artist').value = '';
            document.getElementById('ed-tuning').value = 'standard';
            document.getElementById('ed-capo').value = '0';
            document.getElementById('ed-key').value = '';
            document.getElementById('ed-bpm').value = '120';
            document.getElementById('ed-time-sig').value = '4/4';
            document.getElementById('custom-time-group').style.display = 'none';
            document.getElementById('custom-tuning-group').style.display = 'none';
            render();
        }
    });

    // ---- Save ----
    document.getElementById('btn-save').addEventListener('click', saveToFile);

    document.getElementById('btn-open').addEventListener('click', () => {
        document.getElementById('tbfy-file-input').click();
    });

    document.getElementById('tbfy-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) openFromFile(file);
        e.target.value = '';
    });

    // Ctrl shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 's') { e.preventDefault(); saveToFile(); }
            else if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
            else if (e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
            else if (e.key === 'y') { e.preventDefault(); redo(); }
            else if (e.key === 'c') { e.preventDefault(); copyMeasure(); document.getElementById('status-saved').textContent = 'Measure copied!'; setTimeout(() => { document.getElementById('status-saved').textContent = ''; }, 1500); }
            else if (e.key === 'v') { e.preventDefault(); pasteMeasure(); }
        }
    });

    // ---- Export ----
    function getCurrentTuningMidi() {
        return getEditorTuningMidi();
    }

    document.getElementById('btn-export').addEventListener('click', () => {
        const htmlContent = generatePrintableHTML(doc, getCurrentTuningMidi());
        const printWindow = window.open('', '_blank');
        printWindow.document.write(htmlContent);
        printWindow.document.close();
    });

    // ---- Transpose ----
    document.getElementById('btn-transpose').addEventListener('click', () => {
        document.getElementById('transpose-amount').value = '0';
        document.getElementById('transpose-modal').classList.remove('hidden');
    });

    document.getElementById('transpose-cancel').addEventListener('click', () => {
        document.getElementById('transpose-modal').classList.add('hidden');
    });

    document.getElementById('transpose-apply').addEventListener('click', () => {
        const amount = parseInt(document.getElementById('transpose-amount').value);
        if (amount !== 0) {
            transpose(amount);
        }
        document.getElementById('transpose-modal').classList.add('hidden');
    });

    // ---- Add Section ----
    document.getElementById('btn-add-section').addEventListener('click', () => {
        document.getElementById('section-name-custom').classList.add('hidden');
        document.getElementById('section-modal').classList.remove('hidden');
    });

    document.getElementById('section-name-preset').addEventListener('change', (e) => {
        const custom = document.getElementById('section-name-custom');
        if (e.target.value === 'custom') {
            custom.classList.remove('hidden');
            custom.focus();
        } else {
            custom.classList.add('hidden');
        }
    });

    document.getElementById('section-cancel').addEventListener('click', () => {
        document.getElementById('section-modal').classList.add('hidden');
    });

    document.getElementById('section-apply').addEventListener('click', () => {
        const preset = document.getElementById('section-name-preset').value;
        const custom = document.getElementById('section-name-custom').value;
        const name = preset === 'custom' ? (custom || 'Section') : preset;
        const count = parseInt(document.getElementById('section-measures').value) || 4;
        addSection(name, count);
        document.getElementById('section-modal').classList.add('hidden');
    });

    // ---- Fretboard panel ----
    document.getElementById('btn-fretboard-toggle').addEventListener('click', () => {
        const panel = document.getElementById('fretboard-panel');
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) {
            renderEditorFretboard();
        }
    });

    document.getElementById('fb-close').addEventListener('click', () => {
        document.getElementById('fretboard-panel').classList.add('hidden');
    });

    document.getElementById('fb-scale').addEventListener('change', renderEditorFretboard);
    document.getElementById('fb-root').addEventListener('change', renderEditorFretboard);
    document.getElementById('fb-harmonics').addEventListener('change', renderEditorFretboard);
    document.getElementById('fb-frets').addEventListener('change', renderEditorFretboard);

    // ---- Close modals on overlay click ----
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.add('hidden');
            }
        });
    });

    // ---- Close modals on Escape ----
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
        }
    });
});
