import { api, esc } from '../core.js';
import { icon } from '../icons.js';
import { courseArt, deskIllustration } from '../illustrations.js';
import { deniedPanel, loader, statCard, switchEl } from './shared.js';

const firstName = (user) =>
  user.role === 'lecturer' ? `Dr. ${user.name.split(' ').slice(-1)[0]}` : user.name.split(' ')[0];

function hero(user) {
  const lecturer = user.role === 'lecturer';
  return `
  <section class="hero">
    <div class="hero-text">
      <h2>Hi, ${esc(firstName(user))}</h2>
      <p>${lecturer ? 'Ready to review grades for your course?' : 'Ready to check in on your academic record?'}</p>
      <span class="chip">${icon('shield', 'icon-sm')} Signed in with a server-verified passkey</span>
    </div>
    ${deskIllustration('hero-art')}
  </section>`;
}

function studentCourseCard(g, course) {
  const graded = g.score !== null && g.score !== undefined;
  return `
  <article class="card course-card">
    ${courseArt(g.courseId, 'course-art')}
    <div class="course-main">
      <h3>${esc(g.courseTitle)}</h3>
      <p>Last updated ${esc(new Date(g.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }))} by ${esc(g.updatedBy)}.</p>
      <p class="meta">${esc(g.courseId)}${course ? ` · <span class="muted" style="font-weight:400">${esc(course.semester)}</span>` : ''}</p>
    </div>
    <div class="course-side">
      ${switchEl(graded, graded ? 'Published' : 'Pending')}
      <p><span class="big-score">${esc(g.score ?? '—')}</span> <span class="chip chip-maroon">${esc(g.grade)}</span></p>
    </div>
  </article>`;
}

function lecturerCourseCard(course, roster) {
  const scores = roster.map((r) => r.grades.find((g) => g.courseId === course.id)?.score).filter((s) => typeof s === 'number');
  const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—';
  return `
  <article class="card course-card">
    ${courseArt(course.id, 'course-art')}
    <div class="course-main">
      <h3><a href="#/courses/${encodeURIComponent(course.id)}">${esc(course.title)}</a></h3>
      <p>Roster and grades are visible only to the lecturer assigned to this course.</p>
      <p class="meta">${esc(course.enrolledCount)} students · <span class="muted" style="font-weight:400">avg ${esc(avg)} · ${esc(course.semester)}</span></p>
    </div>
    <div class="course-side">
      ${switchEl(scores.length === roster.length, scores.length === roster.length ? 'All graded' : `${roster.length - scores.length} pending`)}
      <a class="btn btn-ghost btn-sm" href="#/courses/${encodeURIComponent(course.id)}">${icon('pencil', 'icon-sm')} Grades</a>
    </div>
  </article>`;
}

export async function renderDashboard(root, ctx) {
  const { user } = ctx;
  root.innerHTML = loader();
  try {
    const { courses } = await api('GET', '/courses', undefined, { label: 'Dashboard' });
    let overview;
    let list;

    if (user.role === 'student') {
      const { record } = await api('GET', `/students/${encodeURIComponent(user.id)}`, undefined, { label: 'Dashboard' });
      const scores = record.grades.map((g) => g.score).filter((s) => typeof s === 'number');
      const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—';
      const latest = [...record.grades].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
      overview = [
        statCard('gold', 'trend', avg, 'Average score'),
        statCard('maroon', 'checkCircle', `${scores.length}/${courses.length}`, 'Courses graded'),
        statCard('rose', 'star', latest?.grade ?? '—', 'Latest grade'),
        statCard('blush', 'book', `Year ${record.year}`, record.program),
      ].join('');
      list = record.grades.length
        ? record.grades.map((g) => studentCourseCard(g, courses.find((c) => c.id === g.courseId))).join('')
        : '<p class="empty">No grades recorded yet.</p>';
    } else {
      const details = await Promise.all(
        courses.map((c) => api('GET', `/courses/${encodeURIComponent(c.id)}`, undefined, { label: 'Dashboard' }))
      );
      const rosters = details.map((d) => d.roster);
      const all = rosters.flat();
      const mine = all.flatMap((r) => r.grades).filter((g) => g.updatedBy === user.id && courses.some((c) => c.id === g.courseId));
      const scores = all.flatMap((r) => r.grades.filter((g) => courses.some((c) => c.id === g.courseId)).map((g) => g.score));
      const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—';
      overview = [
        statCard('gold', 'book', courses.length, 'Assigned courses'),
        statCard('maroon', 'users', all.length, 'Students taught'),
        statCard('rose', 'trend', avg, 'Class average'),
        statCard('blush', 'pencil', mine.length, 'Grades set by you'),
      ].join('');
      list = courses.length
        ? courses.map((c, i) => lecturerCourseCard(c, rosters[i])).join('')
        : '<p class="empty">You have no course assignments.</p>';
    }

    root.innerHTML = `
    <div class="wrap">
      ${hero(user)}
      <section class="section">
        <div class="section-head"><h2>Overview</h2></div>
        <div class="stats">${overview}</div>
      </section>
      <section class="section">
        <div class="section-head">
          <h2>${user.role === 'lecturer' ? 'Your courses this semester' : 'Your courses'}</h2>
          <a class="link" style="font-size:.875rem" href="#/lab">Run security tests</a>
        </div>
        <div class="list">${list}</div>
      </section>
    </div>`;
  } catch (err) {
    root.innerHTML = `<div class="wrap">${deniedPanel(err, '/courses')}</div>`;
  }
}
