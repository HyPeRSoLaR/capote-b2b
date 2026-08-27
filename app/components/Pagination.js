'use client';

export default function Pagination({ page, pageSize, total, onPage }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  // Show up to 5 page numbers
  const getPages = () => {
    const pages = [];
    let start = Math.max(1, page - 2);
    let end = Math.min(totalPages, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="pagination">
      <span>Showing {from} to {to} of {total}</span>
      <div className="pagination__pages">
        <button
          className="page-btn text"
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
        >
          Previous
        </button>
        {getPages().map(p => (
          <button
            key={p}
            className={`page-btn${p === page ? ' active' : ''}`}
            onClick={() => onPage(p)}
          >
            {p}
          </button>
        ))}
        <button
          className="page-btn text"
          onClick={() => onPage(page + 1)}
          disabled={page === totalPages}
        >
          Next
        </button>
      </div>
    </div>
  );
}
