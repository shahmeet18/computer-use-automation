import type { Member } from './data.js';

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${title} - Member Services</title></head>
<body>
<table width="100%" cellpadding="4" cellspacing="0" border="0">
  <tr><td><h2>Member Services &mdash; Back Office</h2></td></tr>
</table>
<hr>
${body}
</body>
</html>`;
}

export function loginPage(opts: { error?: string } = {}): string {
  return layout(
    'Login',
    `
<form method="post" action="/login">
  <table cellpadding="4" cellspacing="0" border="0">
    <tr><td>${opts.error ? `<b>${opts.error}</b>` : ''}</td></tr>
    <tr>
      <td><label for="username">Username</label></td>
      <td><input type="text" id="username" name="username"></td>
    </tr>
    <tr>
      <td><label for="password">Password</label></td>
      <td><input type="password" id="password" name="password"></td>
    </tr>
    <tr>
      <td colspan="2"><button type="submit">Log In</button></td>
    </tr>
  </table>
</form>`,
  );
}

export function searchPage(opts: { query?: string; notFound?: boolean } = {}): string {
  return layout(
    'Search',
    `
<form method="get" action="/search">
  <table cellpadding="4" cellspacing="0" border="0">
    <tr>
      <td><label for="memberId">Member ID</label></td>
      <td><input type="text" id="memberId" name="memberId" value="${opts.query ?? ''}"></td>
      <td><button type="submit">Search</button></td>
    </tr>
  </table>
</form>
${
  opts.notFound
    ? `<p role="alert">No member found for ID "${opts.query}".</p>`
    : opts.query
      ? `<p><a href="/members/${opts.query}">View member ${opts.query}</a></p>`
      : ''
}`,
  );
}

export function memberDetailPage(member: Member): string {
  return layout(
    `Member ${member.id}`,
    `
<table border="1" cellpadding="4" cellspacing="0">
  <tr><th>Field</th><th>Value</th></tr>
  <tr><td>Member ID</td><td>${member.id}</td></tr>
  <tr><td>Name</td><td>${member.name}</td></tr>
  <tr><td>Savings Balance</td><td>$${member.savingsBalance.toFixed(2)}</td></tr>
  <tr><td>Checking Balance</td><td>$${member.checkingBalance.toFixed(2)}</td></tr>
</table>
<p><a href="/members/${member.id}/sub-account/new">Open Sub-Account</a></p>
<p><a href="/search">Back to Search</a></p>`,
  );
}

export function permissionDeniedPage(member: Member): string {
  return layout(
    'Permission Denied',
    `
<p role="alert">You do not have permission to open a sub-account for member ${member.id}.</p>
<p><a href="/members/${member.id}">Back to member</a></p>`,
  );
}

export function newSubAccountPage(
  member: Member,
  opts: { error?: string; accountType?: string; deposit?: string } = {},
): string {
  return layout(
    'Open Sub-Account',
    `
<p>Opening a new sub-account for <b>${member.name}</b> (${member.id})</p>
${opts.error ? `<p role="alert">${opts.error}</p>` : ''}
<form method="post" action="/members/${member.id}/sub-account/new">
  <table cellpadding="4" cellspacing="0" border="0">
    <tr>
      <td><label for="accountType">Account Type</label></td>
      <td>
        <select id="accountType" name="accountType">
          <option value="savings" ${opts.accountType === 'savings' ? 'selected' : ''}>Savings</option>
          <option value="checking" ${opts.accountType === 'checking' ? 'selected' : ''}>Checking</option>
        </select>
      </td>
    </tr>
    <tr>
      <td><label for="deposit">Initial Deposit</label></td>
      <td><input type="text" id="deposit" name="deposit" value="${opts.deposit ?? ''}"></td>
    </tr>
    <tr>
      <td colspan="2"><button type="submit">Continue</button></td>
    </tr>
  </table>
</form>`,
  );
}

export function confirmSubAccountPage(
  member: Member,
  details: { accountType: string; deposit: string },
): string {
  return layout(
    'Confirm Sub-Account',
    `
<p>Please review the new sub-account details for <b>${member.name}</b> (${member.id}):</p>
<table border="1" cellpadding="4" cellspacing="0">
  <tr><th>Field</th><th>Value</th></tr>
  <tr><td>Account Type</td><td>${details.accountType}</td></tr>
  <tr><td>Initial Deposit</td><td>$${details.deposit}</td></tr>
</table>
<form method="post" action="/members/${member.id}/sub-account/confirm">
  <input type="hidden" name="accountType" value="${details.accountType}">
  <input type="hidden" name="deposit" value="${details.deposit}">
  <button type="submit">Confirm</button>
</form>`,
  );
}

export function subAccountSuccessPage(member: Member, accountNumber: string): string {
  return layout(
    'Sub-Account Created',
    `
<p role="status">Success. New sub-account <b>${accountNumber}</b> created for ${member.name} (${member.id}).</p>
<p><a href="/members/${member.id}">Back to member</a></p>`,
  );
}
