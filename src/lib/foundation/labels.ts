/** Display labels for Foundation enums (client-safe). */

export const FREQUENCY_OPTIONS = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "BIWEEKLY", label: "Every 2 weeks" },
  { value: "SEMIMONTHLY", label: "Twice a month" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "ANNUAL", label: "Yearly" },
];

export const INCOME_TYPE_OPTIONS = [
  { value: "SALARY", label: "Salary (W-2)" },
  { value: "HOURLY", label: "Hourly (W-2)" },
  { value: "OWNER_DRAW", label: "Owner draw", business: true },
  { value: "DISTRIBUTION", label: "Business distribution", business: true },
  { value: "SIDE_INCOME", label: "Side income (1099)" },
  { value: "OTHER", label: "Other" },
];

export const BILL_CATEGORY_OPTIONS = [
  { value: "HOUSING", label: "Housing (rent, HOA)" },
  { value: "UTILITIES", label: "Utilities" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "TRANSPORTATION", label: "Transportation" },
  { value: "PHONE_INTERNET", label: "Phone & internet" },
  { value: "SUBSCRIPTIONS", label: "Subscriptions" },
  { value: "GROCERIES", label: "Groceries" },
  { value: "CHILDCARE", label: "Childcare" },
  { value: "OTHER", label: "Other" },
];

export const DEBT_TYPE_OPTIONS = [
  { value: "MORTGAGE", label: "Mortgage" },
  { value: "HELOC", label: "HELOC" },
  { value: "AUTO", label: "Auto loan" },
  { value: "CREDIT_CARD", label: "Credit card" },
  { value: "PERSONAL", label: "Personal loan" },
  { value: "STUDENT", label: "Student loan" },
  { value: "MEDICAL", label: "Medical" },
  { value: "OTHER", label: "Other" },
];

export const ASSET_TYPE_OPTIONS = [
  { value: "CHECKING", label: "Checking" },
  { value: "SAVINGS", label: "Savings" },
  { value: "INVESTMENT", label: "Investment account" },
  { value: "RETIREMENT", label: "Retirement (401k, IRA)" },
  { value: "HOME", label: "Home" },
  { value: "VEHICLE", label: "Vehicle" },
  { value: "BUSINESS", label: "Business ownership" },
  { value: "OTHER", label: "Other" },
];

export const PROFILE_OPTIONS = [
  { value: "EMPLOYEE", label: "Employee", description: "I earn a paycheck (W-2, salary or hourly)." },
  { value: "BUSINESS_OWNER", label: "Business owner", description: "I own a business or I'm self-employed." },
  { value: "BOTH", label: "Both", description: "I have a job and a business or side business." },
];

export const labelOf = (options: { value: string; label: string }[], value: string) =>
  options.find((o) => o.value === value)?.label ?? value;

export const fmtMoney = (n: number | null | undefined, digits = 0) =>
  n == null
    ? "—"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmtPct = (n: number | null | undefined, digits = 0) => (n == null ? "—" : `${(n * 100).toFixed(digits)}%`);

export const fmtMonth = (ym: string | null) =>
  ym ? new Date(ym.slice(0, 7) + "-15T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—";

export const BUSINESS_EXPENSE_OPTIONS = [
  { value: "PAYROLL", label: "Payroll" },
  { value: "CONTRACTORS", label: "Contractors" },
  { value: "SOFTWARE", label: "Software & subscriptions" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "PROFESSIONAL", label: "Professional services" },
  { value: "ADVERTISING", label: "Advertising & marketing" },
  { value: "TRAVEL", label: "Travel & meals" },
  { value: "RENT", label: "Rent & office" },
  { value: "OTHER", label: "Other" },
];
