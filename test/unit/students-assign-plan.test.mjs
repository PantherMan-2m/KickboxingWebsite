// Finding 6 (review triage, the money bug, ranked #1): openAssignPlanDialog blanked
// the price-override field unconditionally instead of reading the student's existing
// priceOverrideCents, so changing a discounted member's plan silently reset them to
// full price. coach/students.html is a plain <script>, no module system -- same
// situation test/integration/attendance-prefill.test.mjs documents for
// coach/session.html -- but unlike that case the bug here IS the client-side logic,
// not a trivial ternary over an already-correct API contract, so a real behavioural
// test is worth the vm harness rather than a text/regex check. app.js and the inline
// script are loaded into one shared vm context (Node's vm module keeps top-level
// let/const/function declarations live across multiple runInContext calls on the same
// context) with a minimal DOM/fetch stub, then the real openAssignPlanDialog is called
// directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');

function extractInlineScript(html) {
  const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  return matches[matches.length - 1][1];
}

function makeElement() {
  return {
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {},
    querySelectorAll: () => [],
    querySelector: () => makeElement(),
    showModal() {},
    close() {},
  };
}

function loadStudentsPage() {
  const appJs = fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'coach', 'students.html'), 'utf8');
  const inline = extractInlineScript(html);

  const elements = new Map();
  const elementIds = [
    'rosterBody', 'searchInput', 'statusFilter', 'assignPlanDialog', 'assignPlanForm',
    'assignPlanSelect', 'assignPlanHeading', 'assignPlanStart', 'assignPlanOverride',
    'assignPlanStatus', 'assignPlanCancel', 'addStudentForm', 'formStatus', 'year',
    'logoutLink',
  ];
  for (const id of elementIds) elements.set(id, makeElement());

  const documentStub = {
    getElementById: (id) => elements.get(id) || makeElement(),
    querySelector: () => null, // skips app.js's nav/hamburger wiring -- not under test here
    querySelectorAll: () => [],
    createElement: () => {
      let text = '';
      return {
        get textContent() { return text; },
        set textContent(v) { text = String(v); },
        get innerHTML() {
          return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        },
      };
    },
    body: { classList: { add() {}, remove() {}, toggle() {}, contains: () => false } },
  };

  const sandbox = {
    document: documentStub,
    fetch: async () => ({ ok: true, json: async () => ({ ok: true, plans: [], students: [] }) }),
    console,
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(appJs, context, { filename: 'app.js' });
  vm.runInContext(inline, context, { filename: 'students.html inline script' });
  return { context, elements };
}

test('openAssignPlanDialog pre-fills an existing price override instead of blanking it', () => {
  const { context, elements } = loadStudentsPage();
  context.monthlyPlans = [
    { id: 'plan_weekly', name: 'One Class / week', priceCents: 55000, period: 'month', active: 1 },
  ];

  // A family-discounted member (R400 override on a R550 plan) has their plan changed.
  context.openAssignPlanDialog('student-1', 'Family Kid', 40000);

  assert.equal(
    elements.get('assignPlanOverride').value,
    '400',
    'the existing R400 override must be pre-filled, not blanked -- blanking it silently reverts the member to full price'
  );
});

test('openAssignPlanDialog leaves the override blank for a student with no existing override', () => {
  const { context, elements } = loadStudentsPage();
  context.monthlyPlans = [
    { id: 'plan_weekly', name: 'One Class / week', priceCents: 55000, period: 'month', active: 1 },
  ];

  context.openAssignPlanDialog('student-2', 'Regular Member', null);

  assert.equal(elements.get('assignPlanOverride').value, '', 'no override to pre-fill');
});

test('the assign/change-plan button carries the current override in its dataset', () => {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'coach', 'students.html'), 'utf8');
  assert.match(
    html,
    /data-current-override-cents=/,
    'renderRoster must emit the current priceOverrideCents on the button so the click handler can pass it through'
  );
});
