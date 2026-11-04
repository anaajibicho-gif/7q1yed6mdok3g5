// Small stand-in for the dashboard runtime, so the page runs as a plain public site.
(() => {
  const FILES = { live: 'data/live.json', comparison: 'data/comparison.json', cvr: 'data/cvr_summary.json', precmap: 'data/precinct_map.json' };
  const POLL_MS = 60000;
  const STALE_MS = 45 * 60000;
  const store = {};
  const calcs = {};
  const draws = {};
  const dataHooks = [];
  let params = { map_hoods: true, map_metric: 'lead', map_race: 'D2', turnout_OUSD2: null, turnout_OUSD4: null, turnout_OUSD6: null };
  let liveText = '';
  const cellsToText = (rows) => rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value && typeof value === 'object' ? JSON.stringify(value) : value])));
  const runCalcs = () => {
    Object.entries(calcs).forEach(([id, calc]) => {
      if (!calc.inputs.every((name) => store[name] && store[name].status === 'ok')) return;
      try {
        store[id] = { status: 'ok', data: calc.fn(...calc.inputs.map((name) => store[name].data)) };
      } catch (error) {
        console.error(id, error);
        store[id] = { status: 'error', data: null };
      }
    });
  };
  const render = () => {
    Object.entries(draws).forEach(([name, fn]) => {
      document.querySelectorAll(`[data-draw="${name}"]`).forEach((node) => {
        try {
          fn(node);
        } catch (error) {
          console.error(name, error);
        }
      });
    });
    dataHooks.forEach((fn) => fn());
    freshness();
  };
  const freshness = () => {
    const note = document.getElementById('site-stale');
    const live = store.live && store.live.data;
    if (!note || !live) return;
    const status = live.find((row) => row.kind === 'status');
    const age = status ? Date.now() - new Date(status.checked_at).getTime() : 0;
    note.hidden = age < STALE_MS;
    if (!note.hidden) note.textContent = `This page last checked the county at ${new Date(status.checked_at).toLocaleString()}, so these numbers may be out of date.`;
  };
  window.dash = {
    colors: ['#2f6fb3', '#d9822b', '#7a7f87', '#8a63b8', '#2a9d8f'],
    params: () => params,
    setParams: (next) => {
      params = { ...params, ...next };
      render();
    },
    data: (id) => store[id] || { status: 'loading', data: null },
    calc: (id, spec) => { calcs[id] = spec; },
    draw: (name, fn) => { draws[name] = fn; },
    onData: (fn) => { dataHooks.push(fn); },
  };
  const load = async (path) => {
    const response = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.text();
  };
  const start = async () => {
    await Promise.all(Object.entries(FILES).map(async ([id, path]) => {
      const text = await load(path);
      if (id === 'live') liveText = text;
      store[id] = { status: 'ok', data: cellsToText(JSON.parse(text).rows) };
    }));
    runCalcs();
    render();
    setInterval(async () => {
      try {
        const text = await load(FILES.live);
        if (text === liveText) return freshness();
        liveText = text;
        store.live = { status: 'ok', data: cellsToText(JSON.parse(text).rows) };
        runCalcs();
        if (document.activeElement && document.activeElement.matches('input[type=range]')) return;
        render();
      } catch (error) {
        console.warn(error);
      }
    }, POLL_MS);
    let wide = window.innerWidth;
    let wait;
    window.addEventListener('resize', () => {
      if (window.innerWidth === wide) return;
      wide = window.innerWidth;
      clearTimeout(wait);
      wait = setTimeout(render, 200);
    });
  };
  window.addEventListener('DOMContentLoaded', () => {
    start().catch((error) => {
      console.error(error);
      const note = document.getElementById('site-stale');
      if (note) {
        note.hidden = false;
        note.textContent = 'The election data could not load. Please reload this page.';
      }
    });
  });
})();
