import { useEffect, useMemo, useState } from "react"
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination"

/**
 * Client-side paging over rows already in memory.
 *
 * For the small tables only — categories (9 rows), investors (15), users (1).
 * They are fetched once and filtered in JavaScript, and going to the server for
 * a page of nine rows would add a round trip per click for no gain. Expenses
 * (1,801 rows and growing) pages on the server instead, via `expenses_page`.
 */
export function usePagedRows<T>(rows: T[], pageSize: number = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1)

  const total = rows.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  // Filtering can shrink the list under the current page — without this you
  // land on an empty page 7 of 3 and the table looks broken.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const pageRows = useMemo(
    () => rows.slice((page - 1) * pageSize, page * pageSize),
    [rows, page, pageSize]
  )

  return { page, setPage, pageRows, total, pageSize, pageCount }
}
