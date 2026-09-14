export interface Member {
  id: string;
  name: string;
  savingsBalance: number;
  checkingBalance: number;
}

/**
 * Deterministic fixtures relied on by later replay/error-handling work:
 * - "99999" -> not found (business outcome, not a crash)
 * - "00000" -> exists, but permission-denied when opening a sub-account
 * - deposit amount "abc" or <= 0 -> validation error, form re-rendered
 * - "?simulateTimeout=1" on any authenticated route -> session expired, redirect to /login
 */
export const members: Member[] = [
  { id: '12345', name: 'Alice Nguyen', savingsBalance: 4820.5, checkingBalance: 1200.0 },
  { id: '23456', name: 'Brian Osei', savingsBalance: 998.12, checkingBalance: 340.75 },
  { id: '34567', name: 'Carla Reyes', savingsBalance: 15230.0, checkingBalance: 2100.4 },
  { id: '45678', name: 'David Kim', savingsBalance: 60.0, checkingBalance: 15.2 },
  { id: '00000', name: 'Restricted Test Member', savingsBalance: 500.0, checkingBalance: 500.0 },
];

export function findMember(id: string): Member | undefined {
  return members.find((m) => m.id === id);
}

let subAccountSequence = 100000;

export function nextSubAccountNumber(): string {
  subAccountSequence += 1;
  return `SUB-${subAccountSequence}`;
}
