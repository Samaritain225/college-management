# Workspace Rules for bara-api

## 1. Organisation Roles & Safety Guardrails

- **Owner Role Protection**: The `'owner'` role is a special privilege. Standard admins (users with only the `'admin'` role) must never be permitted to modify, demote, or remove a member who possesses the `'owner'` role.
- **Role Preservation**: When updating organization-level roles for a member who is an `'owner'`, the `'owner'` role must be merged and preserved in the final roles array (e.g., updating to `'admin'` results in `['owner', 'admin']` to prevent accidental demotion).
- **Owner Deletion**: Members with the `'owner'` role cannot be deleted or removed from the organization. They must transfer ownership first.
- **Secretariat Role**: The `'secretariat'` role is an organisation-level role for reception/mailroom staff. Users with this role:
  - Can register **incoming couriers** for any department or user in the organisation.
  - Are automatically assigned to the dedicated, auto-created `"Courier Service"` department. Because of this, explicit department assignment is optional when inviting or adding a user with this role.
  - See only couriers in their own department or addressed to them directly.
  - **Cannot** perform admin actions (manage members, settings, etc.).

## 2. Courier Terminology & Mappings

- **Terminology**:
  - The physical carrier or person delivering a courier is referred to as **deliverer** (`delivererName`, `delivererEmail`, `delivererPhone`).
  - The pre-registered sender/recipient from the address book is referred to as **correspondent** (`correspondentId`).
- **Validation**: Incoming and outgoing couriers require a valid `correspondentId`.

## 3. Member Directory Lookup & Resolution

- **Member Lookup**: When updating or removing organization members, endpoints must resolve the target membership using either the Appwrite `membershipId` or the `userId` to ensure backwards compatibility.

## 4. Courier Handler (Imputer)

- **Handler Resolution**: Any assigned user/department, creator, or manager can designate a courier handler/imputer via `handlerUserId`. The service layer must automatically enrich `handlerUserId` into a full `handler` object (containing `id`, `name`, and `avatarUrl`) in both list and show responses.

## 5. Appwrite Storage Authentication

- **Security Masking (404s)**: Appwrite Storage returns a `404 storage_file_not_found` error for authorization or permission failures instead of a `403` to prevent ID enumeration. Always ensure requests to download or view files include the necessary headers (`X-Appwrite-Project`, `X-Appwrite-JWT`) or active session cookies.

## 6. Datatable Design & Component Conventions

All data tables across the application (expenses, categories, investors, users, teachers, students, classes) MUST strictly adhere to the standardized datatable design pattern:
- **Container**: Wrapped in `<div className="rounded-md border border-ink/10 bg-paper overflow-hidden"><div className="overflow-x-auto">`
- **Header**: `<TableHeader><TableRow className="border-b border-ink/10">` with `<TableHead className="text-xs font-display font-semibold text-ink-soft">`
- **Body Rows**: `<TableRow className="border-b border-ink/10 last:border-0 hover:bg-teal-100/30">`
- **Data Cells**: All data cells must use `text-xs`. Primary names/identifiers use `font-display font-semibold text-ink`, subtext uses `text-ink-soft`, and financial figures use `formatMoney(amount)` with `font-display font-bold text-ink`.
- **Action Buttons**: Standardized to `h-8 w-8 text-ink-soft hover:text-teal-950 hover:bg-teal-100/50`.
- **Responsive Hiding**: Non-essential columns must use `hidden sm:table-cell` or `hidden md:table-cell`.

