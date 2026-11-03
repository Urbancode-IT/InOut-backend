/**
 * Profile completion + 1-day attendance lock tests.
 * Run: node scripts/testProfileLock.js
 *
 * Uses in-memory mocks for gate/controller logic.
 * If MONGO_URI is reachable, also runs a live DB round-trip.
 */
require('dotenv').config();
const assert = require('assert');
const mongoose = require('mongoose');
const {
  getMissingProfileFields,
  isProfileComplete,
  hasIncompleteGraceExpired,
  applyProfileGateOnCheckIn,
  clearIncompleteTrackingIfComplete,
} = require('../utils/profileCompletion');

const results = [];
const pass = (name) => {
  results.push({ name, ok: true });
  console.log(`PASS  ${name}`);
};
const fail = (name, err) => {
  results.push({ name, ok: false, err: String(err && err.message ? err.message : err) });
  console.error(`FAIL  ${name}:`, err && err.message ? err.message : err);
};

const makeUser = (overrides = {}) => {
  const user = {
    address: '',
    bloodGroup: '',
    dateOfBirth: null,
    bankDetails: {},
    dateOfJoining: null,
    skills: [],
    rolesAndResponsibility: [],
    company: '',
    position: '',
    profileIncompleteSince: null,
    attendanceLocked: false,
    attendanceLockedAt: null,
    save: async function save() {
      this._saved = true;
      return this;
    },
    ...overrides,
  };
  return user;
};

const completeProfileFields = {
  address: '12 Test Street',
  bloodGroup: 'B+',
  dateOfBirth: new Date('1990-05-05'),
  bankDetails: {
    bankingName: 'HDFC',
    bankAccountNumber: '998877',
    ifscCode: 'HDFC0001',
  },
  aadharCard: { url: 'https://example.com/aadhaar.pdf', filename: 'aadhaar.pdf' },
  dateOfJoining: new Date('2024-01-15'),
  skills: ['JavaScript'],
  rolesAndResponsibility: ['Development'],
  company: 'Urbancode',
  position: 'Developer',
};

async function runUnitAndMocked() {
  try {
    const incomplete = makeUser();
    assert.strictEqual(isProfileComplete(incomplete), false);
    assert.ok(getMissingProfileFields(incomplete).includes('address'));
    assert.ok(getMissingProfileFields(incomplete).includes('bankDetails.ifscCode'));
    assert.ok(getMissingProfileFields(incomplete).includes('dateOfBirth'));
    assert.ok(getMissingProfileFields(incomplete).includes('bloodGroup'));
    assert.ok(getMissingProfileFields(incomplete).includes('aadharCard'));
    assert.ok(!getMissingProfileFields(incomplete).includes('skills'));
    pass('unit: detects incomplete profile fields');
  } catch (e) {
    fail('unit: detects incomplete profile fields', e);
  }

  try {
    const missingAadhar = makeUser({
      ...completeProfileFields,
      aadharCard: { url: '', filename: '' },
    });
    assert.strictEqual(isProfileComplete(missingAadhar), false);
    assert.deepStrictEqual(getMissingProfileFields(missingAadhar), ['aadharCard']);
    pass('unit: missing Aadhaar card = incomplete');
  } catch (e) {
    fail('unit: missing Aadhaar card = incomplete', e);
  }

  try {
    const complete = makeUser({ ...completeProfileFields });
    assert.strictEqual(isProfileComplete(complete), true);
    assert.deepStrictEqual(getMissingProfileFields(complete), []);
    pass('unit: detects complete profile');
  } catch (e) {
    fail('unit: detects complete profile', e);
  }

  try {
    const missingIfsc = makeUser({
      ...completeProfileFields,
      bankDetails: { ...completeProfileFields.bankDetails, ifscCode: '' },
    });
    assert.strictEqual(isProfileComplete(missingIfsc), false);
    assert.deepStrictEqual(getMissingProfileFields(missingIfsc), ['bankDetails.ifscCode']);
    pass('unit: one missing required field (IFSC) = incomplete');
  } catch (e) {
    fail('unit: one missing required field (IFSC) = incomplete', e);
  }

  try {
    const aliasAccount = makeUser({
      ...completeProfileFields,
      bankDetails: {
        bankingName: 'HDFC',
        accountNumber: '998877',
        ifscCode: 'HDFC0001',
      },
    });
    assert.strictEqual(isProfileComplete(aliasAccount), true);
    pass('unit: bank accountNumber alias counts as complete');
  } catch (e) {
    fail('unit: bank accountNumber alias counts as complete', e);
  }

  try {
    const skillsOptional = makeUser({ ...completeProfileFields, skills: [] });
    assert.strictEqual(isProfileComplete(skillsOptional), true);
    pass('unit: skills are not required for profile completion');
  } catch (e) {
    fail('unit: skills are not required for profile completion', e);
  }

  try {
    const missingJoining = makeUser({ ...completeProfileFields, dateOfJoining: null });
    assert.strictEqual(isProfileComplete(missingJoining), true);
    pass('unit: dateOfJoining is not required for profile completion');
  } catch (e) {
    fail('unit: dateOfJoining is not required for profile completion', e);
  }

  try {
    const start = new Date(Date.now() - 12 * 60 * 60 * 1000);
    assert.strictEqual(hasIncompleteGraceExpired(start), false);
    const expired = new Date(Date.now() - 25 * 60 * 60 * 1000);
    assert.strictEqual(hasIncompleteGraceExpired(expired), true);
    pass('unit: 1-day grace expiry math');
  } catch (e) {
    fail('unit: 1-day grace expiry math', e);
  }

  // Incomplete → warning path: tracking starts, check-in still allowed (not locked)
  try {
    const user = makeUser();
    const gate = await applyProfileGateOnCheckIn(user);
    assert.strictEqual(gate.locked, false);
    assert.strictEqual(gate.profileIncomplete, true);
    assert.ok(gate.missingFields.length > 0);
    assert.ok(user.profileIncompleteSince instanceof Date);
    assert.strictEqual(user._saved, true);
    pass('mock: incomplete profile warning + check-in allowed (tracking started)');
  } catch (e) {
    fail('mock: incomplete profile warning + check-in allowed (tracking started)', e);
  }

  // Grace not reset on later incomplete check-in (still within 1 day)
  try {
    const started = new Date('2026-01-01T00:00:00.000Z');
    const user = makeUser({ profileIncompleteSince: started });
    const gate = await applyProfileGateOnCheckIn(user, new Date('2026-01-01T12:00:00.000Z'));
    assert.strictEqual(gate.locked, false);
    assert.strictEqual(user.profileIncompleteSince.toISOString(), started.toISOString());
    pass('mock: grace period not reset on later check-in');
  } catch (e) {
    fail('mock: grace period not reset on later check-in', e);
  }

  // Complete within 1 day → clear tracking
  try {
    const user = makeUser({
      ...completeProfileFields,
      profileIncompleteSince: new Date(Date.now() - 12 * 60 * 60 * 1000),
    });
    const gate = await applyProfileGateOnCheckIn(user);
    assert.strictEqual(gate.profileIncomplete, false);
    assert.strictEqual(gate.locked, false);
    assert.strictEqual(user.profileIncompleteSince, null);
    pass('mock: completing profile before 1 day clears tracking');
  } catch (e) {
    fail('mock: completing profile before 1 day clears tracking', e);
  }

  // Also via clearIncompleteTrackingIfComplete (profile update path)
  try {
    const user = makeUser({
      ...completeProfileFields,
      profileIncompleteSince: new Date(),
    });
    await clearIncompleteTrackingIfComplete(user);
    assert.strictEqual(user.profileIncompleteSince, null);
    pass('mock: profile update clears incomplete tracking when complete');
  } catch (e) {
    fail('mock: profile update clears incomplete tracking when complete', e);
  }

  // 1 day passed → auto lock
  try {
    const user = makeUser({
      profileIncompleteSince: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });
    const gate = await applyProfileGateOnCheckIn(user);
    assert.strictEqual(gate.locked, true);
    assert.strictEqual(gate.justLocked, true);
    assert.strictEqual(user.attendanceLocked, true);
    assert.ok(user.attendanceLockedAt);
    pass('mock: 1 day passed → automatic lock');
  } catch (e) {
    fail('mock: 1 day passed → automatic lock', e);
  }

  // Locked user stays locked (bypass not possible via client state)
  try {
    const user = makeUser({
      attendanceLocked: true,
      profileIncompleteSince: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    });
    const gate = await applyProfileGateOnCheckIn(user);
    assert.strictEqual(gate.locked, true);
    assert.strictEqual(gate.justLocked, false);
    pass('mock: locked user remains locked on check-in gate');
  } catch (e) {
    fail('mock: locked user remains locked on check-in gate', e);
  }

  // Completing profile while locked auto-unlocks
  try {
    const user = makeUser({
      ...completeProfileFields,
      attendanceLocked: true,
      attendanceLockedAt: new Date(),
      profileIncompleteSince: new Date(),
    });
    await clearIncompleteTrackingIfComplete(user);
    assert.strictEqual(user.attendanceLocked, false);
    assert.strictEqual(user.attendanceLockedAt, null);
    assert.strictEqual(user.profileIncompleteSince, null);
    pass('mock: locked user is auto-unlocked when profile is complete');
  } catch (e) {
    fail('mock: locked user is auto-unlocked when profile is complete', e);
  }

  try {
    const user = makeUser({
      ...completeProfileFields,
      attendanceLocked: true,
      attendanceLockedAt: new Date(),
      profileIncompleteSince: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    });
    const gate = await applyProfileGateOnCheckIn(user);
    assert.strictEqual(gate.locked, false);
    assert.strictEqual(gate.profileIncomplete, false);
    assert.strictEqual(user.attendanceLocked, false);
    pass('mock: check-in auto-unlocks when locked user has completed profile');
  } catch (e) {
    fail('mock: check-in auto-unlocks when locked user has completed profile', e);
  }

  // Non-admin blocked by role middleware
  try {
    const roleMw = require('../middleware/role')('admin');
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
    let nextCalled = false;
    roleMw({ user: { role: 'employee' } }, res, () => {
      nextCalled = true;
    });
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(nextCalled, false);
    pass('mock: normal user cannot unlock (role middleware)');
  } catch (e) {
    fail('mock: normal user cannot unlock (role middleware)', e);
  }

  // Admin unlock clears lock + grace (simulates adminController.unlockAttendance)
  try {
    const user = makeUser({
      attendanceLocked: true,
      attendanceLockedAt: new Date(),
      profileIncompleteSince: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    });
    user.attendanceLocked = false;
    user.attendanceLockedAt = null;
    user.profileIncompleteSince = null;
    await user.save();

    assert.strictEqual(user.attendanceLocked, false);
    assert.strictEqual(user.profileIncompleteSince, null);

    const gate = await applyProfileGateOnCheckIn(user);
    assert.strictEqual(gate.locked, false);
    assert.strictEqual(gate.profileIncomplete, true);
    assert.ok(user.profileIncompleteSince);
    pass('mock: admin unlock then check-in allowed under profile rules');
  } catch (e) {
    fail('mock: admin unlock then check-in allowed under profile rules', e);
  }

  // Existing check-in response shape for complete users
  try {
    const user = makeUser({ ...completeProfileFields });
    const gate = await applyProfileGateOnCheckIn(user);
    assert.strictEqual(gate.profileIncomplete, false);
    assert.strictEqual(gate.locked, false);
    pass('mock: complete profile check-in has no warning');
  } catch (e) {
    fail('mock: complete profile check-in has no warning', e);
  }
}

async function runLiveIfPossible() {
  if (!process.env.MONGO_URI) {
    console.log('SKIP  live DB tests (no MONGO_URI)');
    return;
  }

  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  } catch (e) {
    console.log(`SKIP  live DB tests (Mongo unreachable: ${e.message})`);
    return;
  }

  const User = require('../models/User');
  const bcrypt = require('bcryptjs');
  const stamp = Date.now();
  const passwordHash = await bcrypt.hash('TestPass123!', 10);
  let employee;

  try {
    employee = await User.create({
      name: `LockTest Emp ${stamp}`,
      email: `locktest.emp.${stamp}@example.com`,
      password: passwordHash,
      phone: '9000000001',
      position: 'Tester',
      company: 'Urbancode',
      role: 'employee',
    });

    const user = await User.findById(employee._id);
    const gate = await applyProfileGateOnCheckIn(user);
    assert.strictEqual(gate.locked, false);
    assert.strictEqual(gate.profileIncomplete, true);
    const refreshed = await User.findById(employee._id);
    assert.ok(refreshed.profileIncompleteSince);

    refreshed.attendanceLocked = true;
    refreshed.attendanceLockedAt = new Date();
    await refreshed.save();

    const adminController = require('../controllers/adminController');
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
    await adminController.unlockAttendance(
      { params: { id: String(employee._id) }, user: { role: 'admin' } },
      res
    );
    assert.strictEqual(res.body.attendanceLocked, false);
    const unlocked = await User.findById(employee._id);
    assert.strictEqual(unlocked.attendanceLocked, false);
    pass('live: Mongo persist tracking + admin unlock');
  } catch (e) {
    fail('live: Mongo persist tracking + admin unlock', e);
  } finally {
    if (employee) await User.deleteOne({ _id: employee._id });
    await mongoose.disconnect().catch(() => {});
  }
}

async function run() {
  await runUnitAndMocked();
  await runLiveIfPossible();

  const failed = results.filter((r) => !r.ok);
  console.log('\n--- Summary ---');
  console.log(`Passed: ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.err}`));
  }
  process.exit(failed.length ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
