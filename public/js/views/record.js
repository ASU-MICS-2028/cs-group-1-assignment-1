// GET /students/:studentId: the ID comes straight from the URL, so editing it is the T6 test.
import { api, esc, formatDate, initials } from '../core.js';
import { icon } from '../icons.js';
import { deniedPanel, loader } from './shared.js';

export async function renderRecord(root, ctx, studentId) {
  const path = `/students/${encodeURIComponent(studentId)}`;
  root.innerHTML = loader();
  let record;
  try {
    ({ record } = await api('GET', path, undefined, { label: 'Record view' }));
  } catch (err) {
    root.innerHTML = `<div class="wrap" style="max-width:48rem">${deniedPanel(err, `GET ${path} as ${ctx.user.id}`)}</div>`;
    return;
  }

  const other = studentId === 'S001' ? 'S002' : 'S001';
  root.innerHTML = `
  <div class="wrap record-grid">
    <aside class="card profile">
      <div class="profile-head">
        <span class="avatar">${esc(initials(record.fullName))}</span>
        <div><h2>${esc(record.fullName)}</h2><p class="mono" style="font-size:.875rem;color:var(--maroon-700)">${esc(record.studentId)}</p></div>
      </div>
      <dl class="fields">
        <div><dt>Programme</dt><dd>${esc(record.program)}</dd></div>
        <div><dt>Year</dt><dd>${esc(record.year)}</dd></div>
        <div><dt>Academic advisor</dt><dd>${esc(record.advisor)}</dd></div>
      </dl>
      ${ctx.user.role === 'lecturer'
        ? '<p class="alert alert-info" style="margin-top:2rem;font-size:.75rem">You can open this record because the student is enrolled in a course you are assigned to.</p>'
        : ''}
    </aside>
    <section class="card panel">
      <header class="panel-head">
        <h3>Academic record</h3>
        <span class="chip chip-maroon">${icon('lock', 'icon-sm')} Server-authorised view</span>
      </header>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Course</th><th class="right">Score</th><th class="center">Grade</th><th>Updated</th></tr></thead>
          <tbody>
            ${record.grades.map((g) => `
              <tr>
                <td><b>${esc(g.courseTitle)}</b><br/><span class="muted" style="font-size:.75rem">${esc(g.courseId)}</span></td>
                <td class="right mono" style="font-size:1rem;font-weight:600">${esc(g.score ?? '—')}</td>
                <td class="center"><span class="chip chip-maroon">${esc(g.grade)}</span></td>
                <td class="muted">${esc(formatDate(g.updatedAt))} · ${esc(g.updatedBy)}</td>
              </tr>`).join('') || '<tr><td colspan="4" class="muted">No grades recorded.</td></tr>'}
          </tbody>
        </table>
      </div>
      ${ctx.user.role === 'student' ? `
      <p class="panel-foot">
        Try changing the ID in the address bar to <a class="link" href="#/students/${other}">#/students/${other}</a>,
        or open <a class="link" href="/students/${other}" target="_blank" rel="noopener">/students/${other}</a> directly. The server refuses it.
      </p>` : ''}
    </section>
  </div>`;
}
