import express from 'express';
import { findMember, nextSubAccountNumber } from './data.js';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  isValidCredentials,
  requireSession,
  setSessionCookie,
} from './session.js';
import {
  confirmSubAccountPage,
  loginPage,
  memberDetailPage,
  newSubAccountPage,
  permissionDeniedPage,
  searchPage,
  subAccountSuccessPage,
} from './pages.js';

const MIN_DEPOSIT = 25;
const RESTRICTED_MEMBER_ID = '00000';

const app = express();
app.use(express.urlencoded({ extended: false }));

app.get('/', (_req, res) => res.redirect('/login'));

app.get('/login', (_req, res) => {
  res.type('html').send(loginPage());
});

app.post('/login', (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!isValidCredentials(username ?? '', password ?? '')) {
    res.status(401).type('html').send(loginPage({ error: 'Invalid username or password.' }));
    return;
  }
  const token = createSession();
  setSessionCookie(res, token);
  res.redirect('/search');
});

app.post('/logout', requireSession, (req, res) => {
  const cookie = req.headers.cookie ?? '';
  const token = cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('legacy_bank_session='))
    ?.split('=')[1];
  destroySession(token);
  clearSessionCookie(res);
  res.redirect('/login');
});

app.get('/search', requireSession, (req, res) => {
  const memberId = typeof req.query.memberId === 'string' ? req.query.memberId : undefined;
  if (!memberId) {
    res.type('html').send(searchPage());
    return;
  }
  const member = findMember(memberId);
  res.type('html').send(searchPage({ query: memberId, notFound: !member }));
});

app.get('/members/:id', requireSession, (req, res) => {
  const member = findMember(req.params.id);
  if (!member) {
    res.status(404).type('html').send(searchPage({ query: req.params.id, notFound: true }));
    return;
  }
  res.type('html').send(memberDetailPage(member));
});

app.get('/members/:id/sub-account/new', requireSession, (req, res) => {
  const member = findMember(req.params.id);
  if (!member) {
    res.status(404).type('html').send(searchPage({ query: req.params.id, notFound: true }));
    return;
  }
  if (member.id === RESTRICTED_MEMBER_ID) {
    res.status(403).type('html').send(permissionDeniedPage(member));
    return;
  }
  res.type('html').send(newSubAccountPage(member));
});

app.post('/members/:id/sub-account/new', requireSession, (req, res) => {
  const member = findMember(req.params.id);
  if (!member) {
    res.status(404).type('html').send(searchPage({ query: req.params.id, notFound: true }));
    return;
  }
  if (member.id === RESTRICTED_MEMBER_ID) {
    res.status(403).type('html').send(permissionDeniedPage(member));
    return;
  }

  const { accountType, deposit } = req.body as { accountType?: string; deposit?: string };
  const depositAmount = Number(deposit);

  if (!deposit || Number.isNaN(depositAmount) || depositAmount < MIN_DEPOSIT) {
    res.status(400).type('html').send(
      newSubAccountPage(member, {
        error: `Initial deposit must be a number of at least $${MIN_DEPOSIT}.`,
        accountType,
        deposit,
      }),
    );
    return;
  }

  res.type('html').send(
    confirmSubAccountPage(member, {
      accountType: accountType ?? 'savings',
      deposit: depositAmount.toFixed(2),
    }),
  );
});

app.post('/members/:id/sub-account/confirm', requireSession, (req, res) => {
  const member = findMember(req.params.id);
  if (!member) {
    res.status(404).type('html').send(searchPage({ query: req.params.id, notFound: true }));
    return;
  }
  if (member.id === RESTRICTED_MEMBER_ID) {
    res.status(403).type('html').send(permissionDeniedPage(member));
    return;
  }

  const accountNumber = nextSubAccountNumber();
  res.type('html').send(subAccountSuccessPage(member, accountNumber));
});

const port = Number(process.env.TARGET_APP_PORT ?? 4000);
app.listen(port, () => {
  console.log(`Mock legacy bank target app listening on http://localhost:${port}`);
});
