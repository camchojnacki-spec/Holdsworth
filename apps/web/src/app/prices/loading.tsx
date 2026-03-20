import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function PortfolioLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-8 w-28 bg-secondary/30 rounded" />
        <div className="h-4 w-48 bg-secondary/20 rounded mt-2" />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-4 w-20 bg-secondary/20 rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-24 bg-secondary/30 rounded" />
              <div className="h-3 w-32 bg-secondary/20 rounded mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="h-6 w-32 bg-secondary/20 rounded" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, j) => (
                  <div key={j} className="h-14 bg-secondary/10 rounded-lg" />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="h-6 w-40 bg-secondary/20 rounded" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 bg-secondary/10 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
