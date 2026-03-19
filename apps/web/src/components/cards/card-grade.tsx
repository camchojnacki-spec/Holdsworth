"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";
import { gradeCard, getCardGradeReport, type GradeReport } from "@/actions/grading";

interface CardGradeProps {
  cardId: string;
  condition?: string | null;
  conditionNotes?: string | null;
  graded?: boolean;
  gradingCompany?: string | null;
  grade?: string | null;
}

export function CardGrade({ cardId, condition, conditionNotes, graded, gradingCompany, grade }: CardGradeProps) {
  const [report, setReport] = useState<GradeReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCardGradeReport(cardId).then((r) => {
      setReport(r);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [cardId]);

  const handleGrade = async () => {
    setGrading(true);
    setError(null);
    try {
      const result = await gradeCard(cardId);
      if (result) {
        setReport(result);
      } else {
        setError("Could not grade — check that a front photo exists");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Grading failed");
    }
    setGrading(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-lg font-normal text-white">
            Condition
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleGrade}
            disabled={grading}
            className="gap-1.5 text-muted-foreground hover:text-[var(--color-burg-light)] h-7 px-2"
          >
            <Shield className="h-3 w-3" />
            <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase">
              {grading ? "Grading..." : report ? "Re-grade" : "Grade Card"}
            </span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Existing condition info */}
        {condition && (
          <div>
            <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Estimate</label>
            <p className="text-sm text-white">{condition}</p>
          </div>
        )}
        {conditionNotes && (
          <div>
            <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Notes</label>
            <p className="text-sm text-white">{conditionNotes}</p>
          </div>
        )}
        {graded && (
          <div className="grid grid-cols-2 gap-3">
            {gradingCompany && (
              <div>
                <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Grading Company</label>
                <p className="text-sm text-white">{gradingCompany}</p>
              </div>
            )}
            {grade && (
              <div>
                <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Grade</label>
                <p className="text-sm text-white">{grade}</p>
              </div>
            )}
          </div>
        )}

        {/* AI Grade results */}
        {grading ? (
          <div className="py-6">
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-48 h-1 bg-secondary rounded-full overflow-hidden">
                <div
                  className="absolute h-full w-1/3 rounded-full"
                  style={{ background: "var(--color-burg)", animation: "scanSweep 2s cubic-bezier(0.16, 1, 0.3, 1) infinite" }}
                />
              </div>
              <p style={{ fontFamily: "var(--font-display)" }} className="text-base font-light text-white">
                Analyzing card condition
              </p>
              <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">
                Examining centering · corners · edges · surface
              </p>
            </div>
          </div>
        ) : report ? (
          <div className="space-y-4 pt-2 border-t border-secondary/30">
            {/* Overall Grade */}
            <div className="flex items-center gap-4">
              <div className={`flex items-center justify-center w-16 h-16 rounded-lg border-2 ${gradeColor(report.overallGrade)}`}>
                <span style={{ fontFamily: "var(--font-display)" }} className="text-2xl font-light text-white">
                  {report.overallGrade}
                </span>
              </div>
              <div>
                <p style={{ fontFamily: "var(--font-display)" }} className="text-lg font-light text-white">
                  {report.overallLabel}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">
                    {report.confidence}% confidence
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">
                    · Photo: {report.photoQuality}
                  </span>
                </div>
              </div>
            </div>

            {/* Dimension Scores */}
            <div className="grid grid-cols-3 gap-2">
              <DimensionBar label="Centering" score={report.dimensions.centering.score} detail={`${report.dimensions.centering.leftRight} LR · ${report.dimensions.centering.topBottom} TB`} />
              <DimensionBar label="Corners" score={report.dimensions.corners.score} detail={report.dimensions.corners.notes} />
              <DimensionBar label="Edges" score={report.dimensions.edges.score} detail={report.dimensions.edges.notes} />
              <DimensionBar label="Surface" score={report.dimensions.surface.score} detail={report.dimensions.surface.notes} />
              <DimensionBar label="Print" score={report.dimensions.printQuality.score} detail={report.dimensions.printQuality.notes} />
              <DimensionBar label="Eye Appeal" score={report.dimensions.eyeAppeal.score} detail={report.dimensions.eyeAppeal.notes} />
            </div>

            {/* Detailed Breakdown */}
            <details className="group">
              <summary style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground cursor-pointer hover:text-[var(--color-burg-light)] transition-colors">
                Detailed Breakdown
              </summary>
              <div className="mt-3 space-y-3">
                <DetailSection title="Centering">
                  <DetailRow label="Left / Right" value={report.dimensions.centering.leftRight} />
                  <DetailRow label="Top / Bottom" value={report.dimensions.centering.topBottom} />
                </DetailSection>
                <DetailSection title="Corners">
                  <DetailRow label="Top Left" value={report.dimensions.corners.topLeft} />
                  <DetailRow label="Top Right" value={report.dimensions.corners.topRight} />
                  <DetailRow label="Bottom Left" value={report.dimensions.corners.bottomLeft} />
                  <DetailRow label="Bottom Right" value={report.dimensions.corners.bottomRight} />
                </DetailSection>
                <DetailSection title="Edges">
                  <DetailRow label="Top" value={report.dimensions.edges.top} />
                  <DetailRow label="Bottom" value={report.dimensions.edges.bottom} />
                  <DetailRow label="Left" value={report.dimensions.edges.left} />
                  <DetailRow label="Right" value={report.dimensions.edges.right} />
                </DetailSection>
                <DetailSection title="Surface">
                  <DetailRow label="Scratches" value={report.dimensions.surface.scratches} />
                  <DetailRow label="Creases" value={report.dimensions.surface.creases} />
                  <DetailRow label="Staining" value={report.dimensions.surface.staining} />
                  <DetailRow label="Print Defects" value={report.dimensions.surface.printDefects} />
                </DetailSection>
              </div>
            </details>

            {/* PSA Likelihood */}
            <div className="bg-secondary/20 rounded-lg p-3">
              <p className="text-sm text-muted-foreground">{report.psaLikelihood}</p>
            </div>

            <p style={{ fontFamily: "var(--font-mono)" }} className="text-[9px] text-muted-foreground">
              AI assessment · {new Date(report.timestamp).toLocaleDateString()} · Not a substitute for professional grading
            </p>
          </div>
        ) : error ? (
          <div className="py-3 text-center">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DimensionBar({ label, score, detail }: { label: string; score: number; detail: string }) {
  const pct = (score / 10) * 100;
  const color = score >= 9 ? "var(--color-green)" : score >= 7 ? "var(--color-burg-light)" : score >= 5 ? "var(--color-amber, #d4a017)" : "var(--color-burg)";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span style={{ fontFamily: "var(--font-mono)" }} className="text-[9px] tracking-wider uppercase text-muted-foreground">{label}</span>
        <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-white">{score}</span>
      </div>
      <div className="h-1.5 bg-secondary/30 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <p style={{ fontFamily: "var(--font-mono)" }} className="text-[8px] text-muted-foreground truncate" title={detail}>{detail}</p>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground mb-1">{title}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">{children}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[11px] text-white">{value}</span>
    </div>
  );
}

function gradeColor(grade: number): string {
  if (grade >= 9) return "border-[var(--color-green)]";
  if (grade >= 7) return "border-[var(--color-burg-light)]";
  if (grade >= 5) return "border-yellow-500";
  return "border-[var(--color-burg)]";
}
