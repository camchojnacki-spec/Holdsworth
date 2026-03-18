import { Card, CardContent } from "@/components/ui/card";
import { ShoppingCart } from "lucide-react";

export default function DealsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Best Deals</h1>
        <p className="text-muted-foreground">Best current prices on boxes and packs (with Canadian landed cost)</p>
      </div>

      <Card>
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center text-muted-foreground">
            <ShoppingCart className="h-10 w-10 mb-3 opacity-50" />
            <p className="text-sm">No deals found yet</p>
            <p className="text-xs mt-1">Add vendors to start finding deals</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
