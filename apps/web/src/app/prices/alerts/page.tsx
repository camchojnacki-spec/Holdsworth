import { Suspense } from "react";
import { getPriceAlerts } from "@/actions/price-alerts";
import { Card, CardContent } from "@/components/ui/card";
import { Bell } from "lucide-react";
import { AlertsList } from "./alerts-list";
import { CreateAlertForm } from "./create-alert-form";

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ cardId?: string }>;
}) {
  const { cardId } = await searchParams;
  const alerts = await getPriceAlerts();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: "var(--font-display)" }} className="text-3xl font-light tracking-wide text-white">
            Price Alerts
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Get notified when card prices hit your targets
          </p>
        </div>
      </div>

      <Suspense fallback={<div className="h-10" />}>
        <CreateAlertForm prefillCardId={cardId} />
      </Suspense>

      {alerts.length === 0 ? (
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <Bell className="h-10 w-10 mb-3 opacity-50" />
              <p className="text-sm">No alerts yet</p>
              <p className="text-xs mt-1">
                Create your first alert to track price changes on your cards
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <AlertsList alerts={alerts} />
      )}
    </div>
  );
}
