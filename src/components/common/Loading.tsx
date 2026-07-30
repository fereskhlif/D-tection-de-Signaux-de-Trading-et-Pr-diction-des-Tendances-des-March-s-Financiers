interface LoadingProps {
  message?: string;
  fullPage?: boolean;
}

export function Loading({ message = "Chargement...", fullPage = false }: LoadingProps) {
  const inner = (
    <div className="flex flex-col items-center gap-4">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );

  if (fullPage) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center z-50">
        {inner}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-20">
      {inner}
    </div>
  );
}

// Skeleton for table rows
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-border">
          {Array.from({ length: 10 }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-3 bg-secondary rounded animate-pulse" style={{ width: `${40 + ((i + j) % 4) * 15}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
