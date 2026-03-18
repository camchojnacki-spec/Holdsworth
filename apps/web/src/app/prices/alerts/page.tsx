import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell } from "lucide-react";

export default function AlertsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 style={{ fontFamily: "var(--font-display)" }} className="text-3xl font-light tracking-wide text-white">Wax Alerts</h1>
        <p className="text-muted-foreground text-sm mt-1">Get notified when card prices change</p>
      </div>

      <Card>
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center text-muted-foreground">
            <Bell className="h-10 w-10 mb-3 opacity-50" />
            <p className="text-sm">No alerts yet</p>
            <p className="text-xs mt-1">Alerts will appear here when price changes are detected</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
