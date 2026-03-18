import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Store, Plus } from "lucide-react";

export default function VendorsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: "var(--font-display)" }} className="text-3xl font-light tracking-wide text-white">Vendors</h1>
          <p className="text-muted-foreground text-sm mt-1">Track retailers and box/pack prices</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add Vendor
        </Button>
      </div>

      <Card>
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center text-muted-foreground">
            <Store className="h-10 w-10 mb-3 opacity-50" />
            <p className="text-sm">No vendors tracked yet</p>
            <p className="text-xs mt-1">Add vendors to start tracking box and pack prices</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
