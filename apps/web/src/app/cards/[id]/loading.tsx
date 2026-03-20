import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function CardDetailLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-9 w-9 bg-secondary/30 rounded" />
          <div>
            <div className="h-7 w-40 bg-secondary/30 rounded" />
            <div className="h-3 w-28 bg-secondary/20 rounded mt-2" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-16 bg-secondary/30 rounded" />
          <div className="h-8 w-16 bg-secondary/30 rounded" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <div className="aspect-[2.5/3.5] bg-secondary/20 rounded-lg" />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="h-6 w-28 bg-secondary/20 rounded" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i}>
                  <div className="h-3 w-12 bg-secondary/15 rounded mb-1" />
                  <div className="h-4 w-32 bg-secondary/20 rounded" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="h-6 w-32 bg-secondary/20 rounded" />
        </CardHeader>
        <CardContent>
          <div className="h-32 bg-secondary/10 rounded-lg" />
        </CardContent>
      </Card>
    </div>
  );
}
