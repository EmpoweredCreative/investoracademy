import { redirect } from "next/navigation";

/**
 * CSV Import has been moved into the Journal area per account.
 * Redirect to accounts so the user can select an account and open Journal > Import.
 */
export default function ImportPage() {
  redirect("/accounts");
}
