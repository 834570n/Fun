/*
 * Habit Quest — saving.
 *
 * Always keeps a copy in this browser's localStorage. When the page runs as
 * a claude.ai artifact with the `db` capability, it also saves to the
 * viewer's private per-person store (data/users/<id>/...), so progress
 * follows them across devices. Standalone, localStorage is all there is.
 *
 * Cloud layout: one `core` document (hero, quests, side quests, badges,
 * settings) and one `log-YYYY` document per calendar year of daily logs,
 * which keeps every document far below the store's size limit.
 */
(function (root) {
  'use strict';

  var LOCAL_KEY = 'habit-quest:v1';
  var DEBOUNCE_MS = 700;

  var cloud = null;        // { col, written: { docId: json } }
  var timer = null;
  var chain = Promise.resolve();
  var pendingState = null;
  var listeners = [];
  var status = 'local';    // local | saving | cloud | error

  function setStatus(s, detail) {
    status = s;
    listeners.forEach(function (fn) { fn(s, detail); });
  }

  function readLocal() {
    try {
      var raw = root.localStorage.getItem(LOCAL_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeLocal(state) {
    try {
      root.localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearLocal() {
    try { root.localStorage.removeItem(LOCAL_KEY); } catch (e) { /* storage blocked */ }
  }

  /** State -> { docId: body } for the cloud store. */
  function split(state) {
    var docs = {
      core: {
        version: state.version, hero: state.hero, habits: state.habits, todos: state.todos,
        badges: state.badges, settings: state.settings, updatedAt: state.updatedAt
      }
    };
    Object.keys(state.log).forEach(function (key) {
      var id = 'log-' + key.slice(0, 4);
      var doc = docs[id] || (docs[id] = { days: {} });
      doc.days[key] = state.log[key];
    });
    return docs;
  }

  /** { docId: body } -> state (not yet normalized). */
  function join(docs) {
    var core = docs.core || {};
    var state = {
      version: core.version, hero: core.hero, habits: core.habits, todos: core.todos,
      badges: core.badges, settings: core.settings, updatedAt: core.updatedAt || 0, log: {}
    };
    Object.keys(docs).forEach(function (id) {
      if (id.indexOf('log-') !== 0 || !docs[id].days) return;
      Object.assign(state.log, docs[id].days);
    });
    return state;
  }

  function fingerprint(body) {
    var copy = Object.assign({}, body);
    delete copy.updatedAt;
    return JSON.stringify(copy);
  }

  function readCloud() {
    return cloud.col.get().then(function (snap) {
      var docs = {};
      snap.docs.forEach(function (d) { if (d.exists) docs[d.id] = d.data(); });
      return docs;
    });
  }

  /**
   * Try to reach the claude.ai per-person store. Resolves
   * { state } with the saved game, { empty: true } when the store has
   * nothing yet, or null when there is no store in this view.
   */
  function connect() {
    var claude = root.claude;
    if (!claude || typeof claude.use !== 'function') return Promise.resolve(null);
    return Promise.all([claude.use('db'), claude.use('user')]).then(function (caps) {
      var db = caps[0], user = caps[1];
      if (!db || !user) return null;
      return user.id().then(function (uid) {
        if (!uid) return null;
        cloud = { col: db.collection('data/users/' + uid), written: {} };
        return readCloud().then(function (docs) {
          Object.keys(docs).forEach(function (id) { cloud.written[id] = fingerprint(docs[id]); });
          setStatus('cloud');
          return docs.core ? { state: join(docs) } : { empty: true };
        });
      });
    }).catch(function () {
      cloud = null;
      return null;
    });
  }

  /** Re-read the cloud copy (another device may have played since). */
  function refresh() {
    if (!cloud || timer) return Promise.resolve(null);
    return chain.then(readCloud).then(function (docs) {
      if (!docs.core) return null;
      Object.keys(docs).forEach(function (id) { cloud.written[id] = fingerprint(docs[id]); });
      return join(docs);
    }).catch(function () { return null; });
  }

  function writeDoc(id, body) {
    var ref = cloud.col.doc(id);
    return ref.set(body).catch(function (err) {
      if (err && err.code === 'unavailable') {
        return new Promise(function (r) { setTimeout(r, 800 + Math.random() * 800); })
          .then(function () { return ref.set(body); });
      }
      throw err;
    });
  }

  function flush() {
    clearTimeout(timer);
    timer = null;
    var state = pendingState;
    pendingState = null;
    if (!cloud || !state) return chain;
    chain = chain.then(function () {
      var docs = split(state);
      var steps = Promise.resolve();
      Object.keys(docs).forEach(function (id) {
        var fp = fingerprint(docs[id]);
        if (cloud.written[id] === fp) return;
        // One write at a time; send a detached copy of the body.
        steps = steps.then(function () {
          return writeDoc(id, JSON.parse(JSON.stringify(docs[id]))).then(function () { cloud.written[id] = fp; });
        });
      });
      Object.keys(cloud.written).forEach(function (id) {
        if (docs[id]) return;
        steps = steps.then(function () {
          return cloud.col.doc(id).delete().then(function () { delete cloud.written[id]; });
        });
      });
      setStatus('saving');
      return steps;
    }).then(function () {
      setStatus('cloud');
    }).catch(function (err) {
      var code = err && err.code;
      var msg = code === 'quota_exceeded'
        ? 'Your cloud save is full. Export a backup from Setup, then reset old data.'
        : code === 'invalid_argument' || code === 'revoked' || code === 'not_granted'
          ? 'This view can\'t save to your account. Progress is kept in this browser.'
          : 'Couldn\'t reach your cloud save. Progress is kept in this browser and will retry on your next change.';
      setStatus('error', msg);
    });
    return chain;
  }

  /** Save now to this browser, and soon to the cloud. */
  function save(state) {
    writeLocal(state);
    if (!cloud) return;
    pendingState = state;
    clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
  }

  function onStatus(fn) { listeners.push(fn); fn(status); }

  root.HQStorage = {
    readLocal: readLocal, writeLocal: writeLocal, clearLocal: clearLocal,
    connect: connect, refresh: refresh, save: save, flush: flush, onStatus: onStatus,
    hasCloud: function () { return !!cloud; },
    _split: split, _join: join
  };
})(typeof self !== 'undefined' ? self : this);
