import './salonShears.js';
import {
  getState,
  getAllServices,
  subscribe,
  today,
  dayOffset,
  minutes,
  clockTime,
  getShift,
  slots,
  saveVisit,
  cancelVisit,
  saveBlock,
  removeBlock,
  saveShift,
} from './store.js';

const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const ico = (name) =>
  `<svg class="ms-icon" aria-hidden="true"><use href="./public/icons.svg#${name}"></use></svg>`;
const dateLabel = (date, opts) =>
  new Intl.DateTimeFormat('ru-RU', opts).format(new Date(date + 'T12:00:00'));
const dayLabel = (d) =>
  dateLabel(d, { weekday: 'long', day: 'numeric', month: 'long' });
const shortDate = (d) => dateLabel(d, { day: 'numeric', month: 'short' });
const initials = (name) =>
  name
    .trim()
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join('');
const money = (v) => new Intl.NumberFormat('ru-RU').format(v) + ' ₽';
const plural = (n, one, two, many) =>
  n % 10 === 1 && n % 100 !== 11
    ? one
    : n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)
      ? two
      : many;
const btn = (action, label, style = '', icon = '', id = '') =>
  `<button type="button" class="ms-btn ${style}" data-act="${action}" ${id ? 'data-id="' + esc(id) + '"' : ''}>${icon ? ico(icon) : ''}${label}</button>`;
const option = (value, label, selected) =>
  `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`;
const phoneKey = (value) =>
  String(value || '')
    .replace(/\D/g, '')
    .replace(/^8(?=\d{10}$)/, '7');
const visitVersion = (v) =>
  Object.fromEntries(
    [
      'masterId',
      'date',
      'time',
      'serviceId',
      'name',
      'phone',
      'notes',
      'status',
      'stayId',
      'price',
      'duration',
    ].map((key) => [key, v[key]]),
  );
function moscowTime() {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
    hourCycle: 'h23',
  }).format(new Date());
}
export function mountMaster(root) {
  let state = getState(),
    masterId = sessionStorage.getItem('pages.universitetskaya-hotel-demo:uhtl.master.id') || '',
    date = today(),
    tab = 'day',
    dialog = null,
    query = '';
  let returnFocus = null;
  let previousView = '',
    lastRows = new Map();
  const findMaster = () => state.masters.find((m) => m.id === masterId);
  const service = (id) => getAllServices(state).find((s) => s.id === id);
  const myVisits = () => state.visits.filter((v) => v.masterId === masterId);
  const dayVisits = () =>
    myVisits()
      .filter((v) => v.date === date && v.status !== 'cancelled')
      .sort((a, b) => a.time.localeCompare(b.time));
  const dayBlocks = () =>
    state.blocks
      .filter((v) => v.masterId === masterId && v.date === date)
      .sort((a, b) => a.time.localeCompare(b.time));
  const nextVisit = () =>
    dayVisits().find(
      (v) =>
        v.status === 'booked' &&
        (date > today() ||
          (date === today() &&
            minutes(v.time) + v.duration > minutes(moscowTime()))),
    );
  const totalDuration = (v) => v.reduce((sum, row) => sum + row.duration, 0);
  const getVisit = (id) =>
    state.visits.find((v) => v.id === id && v.masterId === masterId);
  const getBlock = (id) =>
    state.blocks.find((v) => v.id === id && v.masterId === masterId);
  root.className = 'ms-root';
  root.innerHTML =
    '<div class="ms-content"></div><div class="ms-shears-stage" aria-hidden="true"><salon-shears></salon-shears></div><dialog class="ms-dialog"></dialog><div class="ms-toast" role="status"></div>';
  const content = root.querySelector('.ms-content'),
    modal = root.querySelector('dialog'),
    toast = root.querySelector('.ms-toast');
  function notify(msg) {
    toast.textContent = msg;
    toast.classList.add('on');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove('on'), 3000);
  }
  function focusTarget() {
    const dom = document.activeElement;
    if (!dom || !content.contains(dom)) return null;
    const selector = dom.dataset.act
      ? `[data-act="${CSS.escape(dom.dataset.act)}"]${dom.dataset.id ? '[data-id="' + CSS.escape(dom.dataset.id) + '"]' : ''}`
      : dom.name
        ? `[name="${CSS.escape(dom.name)}"]`
        : dom.matches('[type=search]')
          ? '[type=search]'
          : dom.id
            ? '#' + CSS.escape(dom.id)
            : '';
    if (!selector) return null;
    const position = [...content.querySelectorAll(selector)].indexOf(dom);
    const caret =
      dom.type === 'search' ? [dom.selectionStart, dom.selectionEnd] : null;
    return () => {
      const matches = content.querySelectorAll(selector),
        dest = matches[position] || matches[0];
      if (!dest) return false;
      dest.focus({ preventScroll: true });
      if (caret) dest.setSelectionRange(...caret);
      return true;
    };
  }
  function dayBar() {
    const start = dayOffset(
      -((new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7),
      date,
    );
    return `<div class="ms-datebar"><button class="ms-iconbtn" aria-label="Предыдущая неделя" data-act="week-prev">${ico('chevron-left')}</button><div class="ms-dates">${Array.from(
      { length: 7 },
      (_, i) => {
        const d = dayOffset(i, start);
        return `<button class="ms-date ${d === date ? 'active' : ''}" data-act="date" data-id="${d}" aria-pressed="${d === date}"><span>${dateLabel(d, { weekday: 'short' })}</span><b>${Number(d.slice(-2))}</b>${d === today() ? '<i aria-label="Сегодня"></i>' : ''}</button>`;
      },
    ).join(
      '',
    )}</div><button class="ms-iconbtn" aria-label="Следующая неделя" data-act="week-next">${ico('chevron-right')}</button><label class="ms-datepicker" title="Выбрать дату">${ico('calendar-days')}<span>${shortDate(date)}</span><input type="date" aria-label="Выбрать дату" name="jump" value="${date}"></label></div>`;
  }
  function hero() {
    const shift = getShift(masterId, date),
      visits = dayVisits(),
      work = shift.off ? 0 : minutes(shift.end) - minutes(shift.start);
    const used = totalDuration(visits),
      pc = work ? Math.round((used / work) * 100) : 0;
    const blocks = dayBlocks();
    const items = [...visits, ...blocks].sort((a, b) =>
      a.time.localeCompare(b.time),
    );
    const band = items
      .map((item) => {
        const start = ((minutes(item.time) - 14 * 60) / 480) * 100,
          length = (item.duration / 480) * 100;
        const label = item.title || item.name;
        return `<button type="button" style="--start:${start}%;--length:${length}%" class="ms-band-item ${item.title ? 'pause' : ''}" title="${esc(item.time + ' · ' + label)}" aria-label="${esc(item.time + ' · ' + label)}" data-act="${item.title ? 'view-block' : 'visit'}" data-id="${esc(item.id)}"></button>`;
      })
      .join('');
    return `<section class="ms-hero"><div class="ms-hero-inner"><div class="ms-hero-text"><div class="ms-kicker">${ico('map-pin')} Демонстрационная смена · 1 этаж</div><h1>Моя смена<span>.</span></h1><p>${esc(dayLabel(date))}</p><div class="ms-hero-meta"><span>${ico('clock-3')}${shift.off ? 'Выходной' : esc(shift.start + ' — ' + shift.end)}</span><i></i><span>${visits.length} ${plural(visits.length, 'визит', 'визита', 'визитов')}</span><i></i><span>${pc}% занято</span></div></div><div class="ms-orbits" aria-hidden="true"><i></i><i></i></div></div></section><div class="ms-band"><div class="ms-band-inner"><b>Занятость</b><div class="ms-band-axis"><span>14:00</span><span>16:00</span><span>18:00</span><span>20:00</span><span>22:00</span><div class="ms-band-bed">${band}</div></div></div></div>`;
  }
  function visitRow(v) {
    const block = Boolean(v.title),
      display = block ? v.title : v.name,
      sub = block ? 'Личное время' : service(v.serviceId)?.title;
    return `<button class="ms-entry ${block ? 'break' : ''} ${v.status === 'done' ? 'done' : ''}" data-act="${block ? 'view-block' : 'visit'}" data-id="${esc(v.id)}"><span class="ms-time"><b>${esc(v.time)}</b><small>${clockTime(minutes(v.time) + v.duration)}</small></span><span class="ms-strand"></span><span class="ms-entry-name"><b>${esc(display)}</b><small>${esc(sub)} · ${v.duration} мин</small></span><span class="ms-entry-tag">${block ? ico('coffee') : v.status === 'done' ? ico('circle-check') : ico('chevron-right')}</span></button>`;
  }
  function dayPage() {
    const visits = dayVisits(),
      blocks = dayBlocks(),
      next = nextVisit(),
      shift = getShift(masterId, date),
      m = findMaster();
    const rec = [...visits, ...blocks].sort((a, b) =>
      a.time.localeCompare(b.time),
    );
    const nextCard = next
      ? `<div class="ms-pass"><div class="ms-pass-top">${ico('scissors')}<span>Ближайший визит</span><i class="ms-dot"></i></div><div class="ms-pass-time">${esc(next.time)}<small> / ${next.duration} мин</small></div><div class="ms-pass-name">${esc(next.name)}</div><p>${esc(service(next.serviceId)?.title)}</p>${next.notes ? `<blockquote>${esc(next.notes)}</blockquote>` : ''}<button type="button" data-act="visit" data-id="${esc(next.id)}">Открыть визит ${ico('arrow-up-right')}</button></div>`
      : `<div class="ms-pass"><div class="ms-pass-top">${ico('scissors')} Ближайший визит</div><div class="ms-pass-name">${shift.off ? 'Выходной день' : 'Свободное время'}</div><p>${shift.off ? 'Часы работы можно изменить во вкладке «График».' : 'На выбранный день новых визитов пока нет.'}</p>${date >= today() && !shift.off && state.services.length ? btn('new', 'Добавить запись', '', 'plus') : ''}</div>`;
    return (
      hero() +
      `<div class="ms-wrap">${dayBar()}<div class="ms-cols"><section><div class="ms-sectiontitle"><div><p>Ежедневник</p><h2>Расписание</h2></div><div class="ms-tools">${date >= today() ? btn('break', 'Перерыв', 'ms-ghost', 'coffee') + btn('new', 'Запись', 'ms-primary', 'plus') : ''}</div></div><div class="ms-rows">${rec.map(visitRow).join('') || `<div class="ms-empty">${ico('calendar-days')}<b>${shift.off ? 'У мастера выходной' : 'День свободен'}</b><p>${shift.off ? 'Часы работы можно изменить во вкладке «График».' : 'Здесь появятся визиты и перерывы.'}</p></div>`}</div></section><aside>${nextCard}<div class="ms-worker"><span class="ms-avatar">${esc(initials(m.name))}</span><div><b>${esc(m.name)}</b><small>${esc(m.role)}</small></div></div></aside></div></div>`
    );
  }
  function customerList() {
    const people = new Map();
    for (const v of myVisits().sort((a, b) =>
      (b.date + b.time).localeCompare(a.date + a.time),
    )) {
      const key = phoneKey(v.phone);
      if (!people.has(key)) people.set(key, { ...v, count: 0 });
      people.get(key).count++;
    }
    const term = query.trim().toLocaleLowerCase('ru');
    const number = /^[+\d\s()-]+$/.test(term) ? phoneKey(term) : '';
    const rows = [...people.values()].filter(
      (v) =>
        (v.name + ' ' + v.phone).toLocaleLowerCase('ru').includes(term) ||
        (number && phoneKey(v.phone).includes(number)),
    );
    return (
      rows
        .map(
          (v) =>
            `<button class="ms-person" data-act="person" data-id="${esc(v.id)}"><span class="ms-avatar">${esc(initials(v.name))}</span><span><b>${esc(v.name)}</b><small>${esc(v.phone)}</small></span><span class="ms-count">${v.count} ${plural(v.count, 'визит', 'визита', 'визитов')}</span>${ico('chevron-right')}</button>`,
        )
        .join('') || '<p class="ms-empty">Клиенты не найдены.</p>'
    );
  }
  function peoplePage() {
    return `<div class="ms-wrap ms-alt"><p class="ms-kicker">Кабинет мастера · Демоверсия</p><h1>Мои клиенты</h1><label class="ms-search">${ico('search')}<input aria-label="Найти клиента по имени или телефону" type="search" placeholder="Имя или телефон" value="${esc(query)}"></label><div id="ms-people">${customerList()}</div></div>`;
  }
  function shiftsPage() {
    const shift = getShift(masterId, date);
    return `<div class="ms-wrap ms-alt"><p class="ms-kicker">Кабинет мастера · Демоверсия</p><h1>Рабочий график</h1>${dayBar()}<div class="ms-shiftcard"><div class="ms-round-icon">${ico('clock-3')}</div><div><p>${dayLabel(date)}</p><h2>${shift.off ? 'Выходной' : shift.start + ' — ' + shift.end}</h2><small>Салон открыт ежедневно с 14:00 до 22:00</small></div>${date >= today() ? btn('shift', 'Изменить смену', 'ms-ghost', 'pencil') : ''}</div><div class="ms-sectiontitle"><h2>Перерывы</h2>${date >= today() ? btn('break', 'Перерыв', 'ms-primary', 'plus') : ''}</div><div class="ms-rows">${dayBlocks().map(visitRow).join('') || '<p class="ms-empty">В расписании на этот день нет перерывов.</p>'}</div></div>`;
  }
  function render() {
    const restore = focusTarget();
    const oldId = masterId;
    state = getState();
    if (!findMaster()) masterId = state.masters[0]?.id || '';
    if (masterId) sessionStorage.setItem('pages.universitetskaya-hotel-demo:uhtl.master.id', masterId);
    else sessionStorage.removeItem('pages.universitetskaya-hotel-demo:uhtl.master.id');
    const m = findMaster();
    const changedMaster = oldId && oldId !== masterId;
    if (changedMaster) {
      query = '';
      if (dialog) close(false);
      notify(
        m
          ? `Состав мастеров изменился. Открыт кабинет: ${m.name}.`
          : 'Выбранный мастер больше не ведёт приём.',
      );
    }
    root.dataset.tab = m ? tab : 'empty';
    if (!m) {
      content.innerHTML = `<header class="ms-top"><div class="ms-topinner"><div class="ms-brand"><span class="ms-logomark">${ico('scissors')}</span><span><b>Парикмахерская</b><small>Университетская</small></span></div></div></header><main class="ms-wrap ms-alt ms-no-roster"><p class="ms-kicker">Кабинет мастера · Демоверсия</p><h1>Приём приостановлен</h1><p>В парикмахерской пока нет действующих мастеров. Администратор может добавить сотрудника и открыть запись.</p><a id="ms-manage-team" class="ms-btn ms-primary" href="../universitetskaya-admin-demo/#team">Управление мастерами ${ico('arrow-up-right')}</a></main>`;
      if (changedMaster)
        content.querySelector('#ms-manage-team').focus({ preventScroll: true });
      else restore?.();
      previousView = '';
      lastRows.clear();
      return;
    }
    content.innerHTML = `<header class="ms-top"><div class="ms-topinner"><div class="ms-brand"><span class="ms-logomark">${ico('scissors')}</span><span><b>Парикмахерская</b><small>Университетская</small></span></div><nav aria-label="Кабинет мастера">${[
      ['day', 'Ежедневник', 'book-open'],
      ['clients', 'Клиенты', 'users-round'],
      ['shifts', 'График', 'calendar-range'],
    ]
      .map(
        ([key, title, icon]) =>
          `<button class="${tab === key ? 'active' : ''}" data-act="tab" data-id="${key}" aria-current="${tab === key ? 'page' : 'false'}">${ico(icon)}${title}</button>`,
      )
      .join(
        '',
      )}</nav><label class="ms-master-switch" title="Сменить мастера"><span class="ms-avatar">${esc(initials(m.name))}</span><span>${esc(m.name.split(' ')[0])}</span>${ico('chevron-down')}<select name="master" aria-label="Выбрать мастера">${state.masters.map((v) => option(v.id, v.name, m.id)).join('')}</select></label></div></header>${tab === 'clients' ? peoplePage() : tab === 'shifts' ? shiftsPage() : dayPage()}<footer class="ms-footer"><span>Парикмахерская гостиницы «Университетская»</span><small>Демонстрационные клиенты и расписание · Изменения сохраняются в этом браузере</small></footer>`;
    const pageKey = [tab, masterId, date].join('/');
    const viewChanged = pageKey !== previousView;
    const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
    if (!reduce && viewChanged) {
      const nodes = content.querySelectorAll(
        '.ms-hero h1,.ms-hero-text>p,.ms-hero-meta,.ms-alt>h1,.ms-pass,.ms-sectiontitle',
      );
      nodes.forEach((node, i) =>
        node.animate(
          [
            { transform: 'translateY(13px)', opacity: 0.48 },
            { transform: 'translateY(0)', opacity: 1 },
          ],
          {
            duration: 450,
            delay: Math.min(i, 4) * 40,
            easing: 'cubic-bezier(.18,.78,.2,1)',
          },
        ),
      );
    }
    const nextRows = new Map();
    for (const [i, row] of [
      ...content.querySelectorAll('.ms-entry'),
    ].entries()) {
      const key = row.dataset.id,
        signature = row.textContent.trim();
      nextRows.set(key, signature);
      if (!reduce && (viewChanged || lastRows.get(key) !== signature)) {
        if (!viewChanged) {
          row.animate(
            [
              { background: '#e2fa68', transform: 'translateX(9px)' },
              { background: 'transparent', transform: 'translateX(0)' },
            ],
            { duration: 980, easing: 'ease-out' },
          );
        } else {
          row.animate(
            [
              { transform: 'translateX(-10px)', opacity: 0.5 },
              { transform: 'none', opacity: 1 },
            ],
            { duration: 360, delay: Math.min(i, 5) * 42, easing: 'ease-out' },
          );
        }
      }
    }
    lastRows = nextRows;
    previousView = pageKey;
    if (changedMaster || (restore && !restore() && !modal.open))
      content.querySelector('[name="master"]')?.focus({ preventScroll: true });
  }
  function close(restore = true) {
    if (modal.open) modal.close();
    dialog = null;
    if (restore && !returnFocus?.())
      content
        .querySelector('[name="master"],#ms-manage-team')
        ?.focus({ preventScroll: true });
    returnFocus = null;
  }
  function show(kind, id = '') {
    if (!findMaster()) return;
    const v = getVisit(id),
      b = getBlock(id);
    let title = '',
      body = '',
      actions = '';
    if (['visit', 'edit', 'person', 'cancel'].includes(kind) && !v) return;
    if (kind === 'view-block' && !b) return;
    if (!modal.open) returnFocus = focusTarget();
    dialog = { kind, id, masterId, date, expected: v ? visitVersion(v) : null };
    const focus =
      modal.open && modal.contains(document.activeElement)
        ? document.activeElement.closest('[data-act]')?.dataset.act
        : '';
    const field = (label, html) =>
      `<label class="ms-field"><span>${label}</span>${html}</label>`;
    if (kind === 'visit') {
      title = esc(v.name);
      body = `<div class="ms-bigtime">${esc(v.time)} <small>${shortDate(v.date)}</small></div><dl class="ms-facts"><div><dt>Услуга</dt><dd>${esc(service(v.serviceId)?.title)}</dd></div><div><dt>Длительность</dt><dd>${v.duration} минут</dd></div><div><dt>Телефон</dt><dd>${esc(v.phone)}</dd></div><div><dt>Статус</dt><dd>${{ booked: 'Запланирован', done: 'Завершён', cancelled: 'Отменён' }[v.status]}</dd></div>${v.stayId ? `<div><dt>Бронь номера</dt><dd>${esc(v.stayId)}</dd></div>` : ''}</dl>${v.notes ? `<p class="ms-note">${esc(v.notes)}</p>` : ''}`;
      if (v.status === 'booked')
        actions =
          (v.date < today() || (v.date === today() && v.time <= moscowTime())
            ? btn('finish', 'Завершить визит', 'ms-primary', 'check', id)
            : '') +
          btn('edit', 'Изменить запись', 'ms-ghost', 'pencil', id) +
          btn('cancel', 'Отменить визит', 'ms-plain', '', id);
    } else if (kind === 'cancel') {
      title = 'Отменить визит?';
      body = `<p>${esc(v.name)}, ${shortDate(v.date)} в ${esc(v.time)}. Время освободится для записи.</p>`;
      actions =
        btn('confirm-cancel', 'Отменить визит', 'ms-primary', '', id) +
        btn('visit', 'Вернуться', 'ms-ghost', '', id);
    } else if (kind === 'person') {
      title = esc(v.name);
      body = `<p>${esc(v.phone)}</p><h3>Визиты к мастеру</h3>${myVisits()
        .filter((r) => phoneKey(r.phone) === phoneKey(v.phone))
        .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
        .map(
          (r) =>
            `<button class="ms-history" data-act="visit" data-id="${esc(r.id)}"><span>${shortDate(r.date)} · ${esc(r.time)}</span><b>${esc(service(r.serviceId)?.title)}</b><small>${r.status === 'cancelled' ? 'Отменён' : r.status === 'done' ? 'Завершён' : 'Запланирован'}</small></button>`,
        )
        .join('')}`;
    } else if (kind === 'view-block') {
      title = esc(b.title);
      body = `<div class="ms-bigtime">${esc(b.time)} <small>${b.duration} мин</small></div><p>${dayLabel(b.date)}</p>`;
      actions = btn('unblock', 'Убрать перерыв', 'ms-primary', '', id);
    } else if (kind === 'shift') {
      const s = getShift(masterId, date);
      dialog.expected = { start: s.start, end: s.end, off: s.off };
      title = 'Часы смены';
      body = `<p>${dayLabel(date)} · <span data-ms-owner>${esc(findMaster().name)}</span></p><label class="ms-check"><input type="checkbox" name="off" ${s.off ? 'checked' : ''}> Выходной день</label><div class="ms-pair">${field('Начало', '<input type="time" name="start" value="' + s.start + '" required step="900" min="14:00" max="22:00">')}${field('Конец', '<input type="time" name="end" value="' + s.end + '" required step="900" min="14:00" max="22:00">')}</div>`;
      actions = '<button class="ms-btn ms-primary">Сохранить смену</button>';
    } else if (kind === 'break') {
      title = 'Перерыв';
      const shift = getShift(masterId, date);
      const begin = Math.max(
        minutes(shift.start),
        date === today() ? Math.ceil(minutes(moscowTime()) / 15) * 15 : 0,
      );
      const end = minutes(shift.end),
        busy = [...dayVisits(), ...dayBlocks()];
      let first = '',
        duration = 30;
      for (const length of [30, 15]) {
        for (
          let t = begin;
          !first && !shift.off && t + length <= end;
          t += 15
        ) {
          if (
            busy.every(
              (v) =>
                t + length <= minutes(v.time) ||
                t >= minutes(v.time) + v.duration,
            )
          ) {
            first = clockTime(t);
            duration = length;
          }
        }
        if (first) break;
      }
      body = `<p><span data-ms-owner>${esc(findMaster().name)}</span> · ${dayLabel(date)}</p>${field('Название', '<input name="title" value="Перерыв" maxlength="100" required>')}<div class="ms-pair">${field('Начало', '<input type="time" name="time" value="' + first + '" min="14:00" max="21:45" step="900" required>')}${field('Продолжительность', '<select name="duration">' + [15, 30, 45, 60, 90, 120].map((n) => option(String(n), n + ' мин', String(duration))).join('') + '</select>')}</div>${first ? '' : '<p>В выбранной смене свободных интервалов нет.</p>'}`;
      actions = '<button class="ms-btn ms-primary">Поставить перерыв</button>';
    } else if (kind === 'new' || kind === 'edit') {
      title = v ? 'Изменить запись' : 'Новая запись';
      const d = v?.date || date;
      body = `<p data-ms-owner>${esc(findMaster().name)}</p>${field('Услуга', '<select name="serviceId">' + state.services.map((s) => option(s.id, s.title + ' · ' + s.duration + ' мин', v?.serviceId)).join('') + '</select>')}<div class="ms-pair">${field('Дата', '<input type="date" name="date" min="' + today() + '" value="' + esc(d) + '" required>')}${field('Время', '<select required name="time"></select>')}</div>${field('Имя клиента', '<input name="name" autocomplete="name" placeholder="Имя и фамилия" value="' + esc(v?.name) + '" minlength="2" maxlength="90" required>')}${field('Телефон', '<input name="phone" type="tel" autocomplete="tel" placeholder="+7" value="' + esc(v?.phone) + '" maxlength="35" required>')}${field('Пожелания', '<textarea name="notes" rows="2" maxlength="900">' + esc(v?.notes) + '</textarea>')}`;
      actions = '<button class="ms-btn ms-primary">Сохранить запись</button>';
    }
    modal.innerHTML = `<form class="ms-form"><div class="ms-mod-top"><span>${ico('scissors')} Кабинет мастера</span><button type="button" class="ms-iconbtn" aria-label="Закрыть" data-act="close">${ico('x')}</button></div><h2>${title}</h2>${body}<p class="ms-error" role="alert"></p><div class="ms-actions">${actions}</div></form>`;
    if (['edit', 'new'].includes(kind)) {
      refreshServiceChoices(v?.serviceId ?? state.services[0]?.id ?? '');
      updateTimes(v?.time);
      if (v && v.date < today())
        modal.querySelector('[name=date]').min = v.date;
    }
    modal.querySelector('h2').id = 'ms-dialog-heading';
    modal.setAttribute('aria-labelledby', 'ms-dialog-heading');
    if (!modal.open) modal.showModal();
    else if (focus)
      (
        modal.querySelector('[data-act="' + CSS.escape(focus) + '"]') ||
        modal.querySelector('[data-act=close]')
      )?.focus({ preventScroll: true });
  }
  function refreshServiceChoices(selected) {
    const f = modal.querySelector('form');
    const input = f?.elements.serviceId;
    if (!input) return;
    const original = dialog.id ? getVisit(dialog.id) : null;
    const choices = [...state.services];
    if (original && !choices.some((s) => s.id === original.serviceId)) {
      const retired = service(original.serviceId);
      if (retired) choices.unshift({ ...retired, retired: true });
    }
    const value = selected ?? input.value;
    const found = choices.some((s) => s.id === value);
    const markup =
      (found
        ? ''
        : option(
            '',
            choices.length
              ? 'Выберите действующую услугу'
              : 'Нет доступных услуг',
            '',
          )) +
      choices
        .map((s) =>
          option(
            s.id,
            s.title +
              ' · ' +
              (s.id === original?.serviceId ? original.duration : s.duration) +
              ' мин' +
              (s.retired ? ' · архив' : ''),
            value,
          ),
        )
        .join('');
    if (input.innerHTML !== markup) input.innerHTML = markup;
    input.required = true;
  }
  function updateTimes(preferred) {
    const f = modal.querySelector('form');
    if (!f?.elements.time || !f.elements.serviceId) return;
    const data = getVisit(dialog.id),
      date = f.elements.date.value,
      serviceId = f.elements.serviceId.value;
    const prev = preferred || f.elements.time.value,
      options = slots({
        date,
        masterId: dialog.masterId,
        serviceId,
        excludeId: data?.id,
      }).map((v) => v.time);
    if (
      data &&
      data.date === date &&
      data.serviceId === serviceId &&
      !options.includes(data.time)
    )
      options.unshift(data.time);
    f.elements.time.innerHTML = options.length
      ? options.map((t) => option(t, t, prev)).join('')
      : '<option value="">Нет свободного времени</option>';
    if (preferred === undefined && prev && !options.includes(prev))
      dialog.mustChooseTime = true;
    if (preferred !== undefined) dialog.mustChooseTime = false;
    if (dialog.mustChooseTime && options.length)
      f.elements.time.insertAdjacentHTML(
        'afterbegin',
        '<option value="" selected>Выберите время заново</option>',
      );
    f.querySelector('.ms-actions button').disabled =
      !options.length || !serviceId || Boolean(dialog.stale || dialog.pending);
    const msg = 'Запись откроется, когда администратор добавит услугу.';
    const warning = f.querySelector('.ms-error');
    if (!serviceId && !state.services.length) warning.textContent = msg;
    else if (warning.textContent === msg) warning.textContent = '';
  }
  async function handleAction(action, id) {
    if (action === 'close') {
      close();
      return;
    }
    if (action === 'tab') {
      tab = id;
      render();
      return;
    }
    if (action === 'date' || action.startsWith('week-')) {
      date =
        action === 'date'
          ? id
          : dayOffset(action === 'week-next' ? 7 : -7, date);
      render();
      return;
    }
    if (
      action === 'finish' ||
      action === 'confirm-cancel' ||
      action === 'unblock'
    ) {
      const opened = dialog;
      if (
        !opened ||
        opened.pending ||
        opened.id !== id ||
        opened.masterId !== masterId
      )
        return;
      opened.pending = true;
      try {
        if (action === 'finish')
          await saveVisit({ id, status: 'done' }, opened.expected);
        else if (action === 'confirm-cancel')
          await cancelVisit(id, opened.expected);
        else await removeBlock(id);
      } finally {
        opened.pending = false;
      }
      if (dialog !== opened) return;
      close();
      notify(
        action === 'finish'
          ? 'Визит завершён'
          : action === 'unblock'
            ? 'Время снова доступно'
            : 'Запись отменена',
      );
      return;
    }
    show(action, id);
  }
  function error(message) {
    const el = modal.querySelector('.ms-error');
    if (modal.open && el) el.textContent = message;
    else notify(message);
  }
  root.addEventListener('click', async (e) => {
    if (e.target === modal) {
      const r = modal.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        close();
      return;
    }
    const button = e.target.closest('[data-act]');
    if (!button) return;
    try {
      await handleAction(button.dataset.act, button.dataset.id);
    } catch (err) {
      error(err.message);
    }
  });
  root.addEventListener('change', (e) => {
    if (e.target.name === 'master') {
      if (modal.open) close(false);
      masterId = e.target.value;
      query = '';
      sessionStorage.setItem('pages.universitetskaya-hotel-demo:uhtl.master.id', masterId);
      render();
    }
    if (e.target.name === 'time' && dialog) dialog.mustChooseTime = false;
    if (e.target.name === 'jump' && e.target.value) {
      date = e.target.value;
      render();
    }
    if (
      modal.contains(e.target) &&
      ['serviceId', 'date'].includes(e.target.name)
    )
      updateTimes('');
  });
  root.addEventListener('input', (e) => {
    if (e.target.type === 'search') {
      query = e.target.value;
      document.getElementById('ms-people').innerHTML = customerList();
    }
  });
  modal.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  modal.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!dialog) return;
    const f = e.target,
      values = Object.fromEntries(new FormData(f)),
      opened = dialog,
      { kind, id, masterId: owner, date: openedDate } = opened,
      button = e.submitter;
    if (
      opened.pending ||
      opened.stale ||
      owner !== masterId ||
      !getState().masters.some((m) => m.id === owner)
    ) {
      if (!opened.pending && !opened.stale) {
        close(false);
        render();
      }
      return;
    }
    opened.pending = true;
    if (button) button.disabled = true;
    try {
      if (kind === 'shift')
        await saveShift(
          {
            ...values,
            off: values.off === 'on',
            masterId: owner,
            date: openedDate,
          },
          opened.expected,
        );
      else if (kind === 'break')
        await saveBlock({ ...values, masterId: owner, date: openedDate });
      else if (kind === 'edit' || kind === 'new')
        await saveVisit(
          { ...values, ...(id ? { id } : {}), masterId: owner },
          opened.expected || {},
        );
      else return;
      if (dialog !== opened) return;
      if (values.date) date = values.date;
      close();
      render();
      notify(
        kind === 'shift'
          ? 'График обновлён'
          : kind === 'break'
            ? 'Перерыв добавлен'
            : 'Запись сохранена',
      );
    } catch (err) {
      if (dialog === opened) error(err.message);
    } finally {
      opened.pending = false;
      if (button && dialog === opened && !opened.stale) button.disabled = false;
    }
  });
  render();
  subscribe(() => {
    render();
    if (!dialog || dialog.pending) return;
    const name = modal.querySelector('[data-ms-owner]');
    if (name) name.textContent = findMaster().name;
    const record =
      dialog.kind === 'shift'
        ? getShift(dialog.masterId, dialog.date)
        : dialog.id
          ? getVisit(dialog.id)
          : null;
    if (
      ['edit', 'visit', 'cancel', 'person'].includes(dialog.kind) &&
      !record
    ) {
      close();
      notify('Визит больше не относится к расписанию этого мастера.');
      return;
    }
    if (
      ['edit', 'cancel', 'shift'].includes(dialog.kind) &&
      dialog.expected &&
      Object.entries(dialog.expected).some(([k, v]) => record[k] !== v)
    ) {
      dialog.stale = true;
      modal.querySelectorAll('.ms-actions button').forEach((b) => {
        b.disabled = true;
      });
      error(
        dialog.kind === 'shift'
          ? 'Смена изменена в другой вкладке. Откройте график заново.'
          : 'Визит изменён в другой вкладке. Закройте форму и откройте актуальную запись.',
      );
      return;
    }
    if (dialog.kind === 'edit' || dialog.kind === 'new') {
      refreshServiceChoices();
      updateTimes();
    } else if (
      dialog &&
      ['visit', 'person', 'view-block'].includes(dialog.kind)
    ) {
      if (dialog.kind === 'view-block' && !getBlock(dialog.id)) close();
      else show(dialog.kind, dialog.id);
    }
  });
}
