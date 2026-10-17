// GET /courses/:courseId and POST /courses/:courseId/grades/:studentId (lecturer only, enforced server-side).
import { GRADE_LETTERS, api, esc, formatDate, initials, spinner, toast } from '../core.js';
import { icon } from '../icons.js';
import { deniedPanel, loader } from './shared.js';

function row(courseId, r) {
  const g = r.grades.find((x) => x.courseId === courseId) || {};
  return `
  <tr>
    <td>
      <a class="person" href="#/students/${encodeURIComponent(r.studentId)}">
        <span class="avatar">${esc(initials(r.fullName))}</span>
        <span><b>${esc(r.fullName)}</b><br/><span class="mono muted" style="font-size:.75rem">${esc(r.studentId)}</span></span>
      </a>
    </td>
    <td class="muted">${esc(r.program)}</td>
    <td>
      <form class="grade-form" data-student="${esc(r.studentId)}">
        <label class="sr-only" for="letter-${esc(r.studentId)}">Letter grade for ${esc(r.studentId)}</label>
        <select class="select" id="letter-${esc(r.studentId)}" name="grade">
          ${GRADE_LETTERS.map((l) => `<option ${l === g.grade ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <label class="sr-only" for="score-${esc(r.studentId)}">Score for ${esc(r.studentId)}</label>
        <input class="input" id="score-${esc(r.studentId)}" name="score" type="number" min="0" max="100" step="1" required value="${esc(g.score ?? '')}" />
        <button class="btn btn-primary btn-sm" type="submit">${icon('check', 'icon-sm')}<span>Save</span></button>
      </form>
    </td>
    <td class="muted" style="font-size:.75rem">${esc(formatDate(g.updatedAt))}<br/>by ${esc(g.updatedBy ?? '—')}</td>
  </tr>`;
}

export async function renderRoster(root, ctx, courseId) {
  const path = `/courses/${encodeURIComponent(courseId)}`;
  root.innerHTML = loader();
  let data;
  try {
    data = await api('GET', path, undefined, { label: 'Roster view' });
  } catch (err) {
    root.innerHTML = `<div class="wrap" style="max-width:48rem">${deniedPanel(err, `GET ${path} as ${ctx.user.id}`)}</div>`;
    return;
  }
  const { course, roster } = data;
  const scores = roster.map((r) => r.grades.find((g) => g.courseId === course.id)?.score).filter((s) => typeof s === 'number');
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—';

  root.innerHTML = `
  <div class="wrap">
    <section class="banner-dark">
      <div>
        <p class="eyebrow">${esc(course.id)} · ${esc(course.semester)}</p>
        <h2>${esc(course.title)}</h2>
        <p>Grade changes go to <code style="color:var(--gold-300)">POST /courses/${esc(course.id)}/grades/:studentId</code>. The server checks that you are the assigned lecturer on every request.</p>
      </div>
      <div class="banner-stats">
        <div><b>${roster.length}</b><small>students</small></div>
        <div><b>${esc(avg)}</b><small>average</small></div>
      </div>
    </section>
    <section class="card panel" style="margin-top:2rem">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Student</th><th>Programme</th><th class="right">Grade &amp; score</th><th>Last change</th></tr></thead>
          <tbody>${roster.map((r) => row(course.id, r)).join('')}</tbody>
        </table>
      </div>
    </section>
  </div>`;

  root.querySelectorAll('.grade-form').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const studentId = form.dataset.student;
      const btn = form.querySelector('button');
      const grade = form.elements.grade.value;
      const score = Number(form.elements.score.value);
      btn.disabled = true;
      btn.innerHTML = spinner('spinner icon-sm');
      try {
        await api('POST', `/courses/${encodeURIComponent(course.id)}/grades/${encodeURIComponent(studentId)}`, { grade, score }, { label: 'T8 Grade update' });
        toast(`Saved ${studentId}: ${grade} (${score}). The server verified your course assignment.`, 'success');
        renderRoster(root, ctx, courseId);
      } catch (err) {
        toast(`HTTP ${err.status ?? ''} ${err.message}`, 'error');
        btn.disabled = false;
        btn.innerHTML = `${icon('check', 'icon-sm')}<span>Save</span>`;
      }
    });
  });
}
