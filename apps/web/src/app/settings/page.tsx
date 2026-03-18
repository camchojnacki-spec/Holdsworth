"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Save } from "lucide-react";

export default function SettingsPage() {
  const [province, setProvince] = useState("ON");
  const [googleApiKey, setGoogleApiKey] = useState("");

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
            <label className="text-sm font-medium text-muted-foreground">Province</label>
            <select
              value={province}
              onChange={(e) => setProvince(e.target.value)}
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

      {/* API Keys */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">API Configuration</CardTitle>
          <CardDescription>Configure your Google Cloud AI API key for card scanning</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Google AI API Key</label>
            <Input
              type="password"
              value={googleApiKey}
              onChange={(e) => setGoogleApiKey(e.target.value)}
              placeholder="Enter your Google AI API key"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Used for Gemini Vision card identification
            </p>
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
            <label className="text-sm font-medium text-muted-foreground">Update Frequency</label>
            <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="manual">Manual only</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">Alert Threshold</label>
            <div className="flex items-center gap-2">
              <Input type="number" defaultValue="10" className="w-24" />
              <span className="text-sm text-muted-foreground">% price change triggers alert</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button className="gap-2">
          <Save className="h-4 w-4" />
          Save Settings
        </Button>
      </div>
    </div>
  );
}
