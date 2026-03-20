export default function BinderLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-24 bg-secondary/30 rounded" />
          <div className="h-4 w-32 bg-secondary/20 rounded mt-2" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-20 bg-secondary/30 rounded" />
          <div className="h-9 w-28 bg-secondary/30 rounded" />
        </div>
      </div>

      {/* Filters skeleton */}
      <div className="flex gap-3">
        <div className="flex-1 h-9 bg-secondary/20 rounded" />
        <div className="h-9 w-24 bg-secondary/20 rounded" />
        <div className="h-9 w-28 bg-secondary/20 rounded" />
        <div className="h-9 w-24 bg-secondary/20 rounded" />
      </div>

      {/* Card grid skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="rounded-lg overflow-hidden bg-card border border-border">
            <div className="aspect-[2.5/3.5] bg-secondary/20" />
            <div className="p-3 space-y-2">
              <div className="h-4 w-3/4 bg-secondary/20 rounded" />
              <div className="h-3 w-1/2 bg-secondary/15 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
