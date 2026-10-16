/** Generic paginated response used by the tracks endpoint (mongoose-aggregate-paginate-v2). */
export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  pages: number;
  pagingCounter: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  prevPage: number | null;
  nextPage: number | null;
}
