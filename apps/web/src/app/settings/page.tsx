"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Save, Loader2, Check } from "lucide-react";
import { getSettings, saveSettings, type SettingsData } from "@/actions/settings";

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData>({ province: "ON", updateFrequency: "weekly", alertThreshold: 10 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    await saveSettings(settings);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 style={{ fontFamily: "var(--font-display)" }} className="text-3xl font-light tracking-wide text-white">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Configure your Holdsworth preferences</p>
      </div>

      {/* Location */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Location</CardTitle>
          <CardDescription>Used for tax and tariff calculations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Province</label>
            <select
              value={settings.province}
              onChange={(e) => setSettings(s => ({ ...s, province: e.target.value }))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="AB">Alberta</option>
              <option value="BC">British Columbia</option>
              <option value="MB">Manitoba</option>
              <option value="NB">New Brunswick</option>
              <option value="NL">Newfoundland and Labrador</option>
              <option value="NS">Nova Scotia</option>
              <option value="NT">Northwest Territories</option>
              <option value="NU">Nunavut</option>
              <option value="ON">Ontario</option>
              <option value="PE">Prince Edward Island</option>
              <option value="QC">Quebec</option>
              <option value="SK">Saskatchewan</option>
              <option value="YT">Yukon</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Price tracking */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Price Tracking</CardTitle>
          <CardDescription>Configure automatic price scraping</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Update Frequency</label>
            <select
              value={settings.updateFrequency}
              onChange={(e) => setSettings(s => ({ ...s, updateFrequency: e.target.value }))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="manual">Manual only</option>
            </select>
          </div>
          <div>
            <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Alert Threshold</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={settings.alertThreshold}
                onChange={(e) => setSettings(s => ({ ...s, alertThreshold: parseInt(e.target.value) || 0 }))}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">% price change triggers alert</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? "Saving..." : saved ? "Saved" : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
