"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";
import { deleteCard } from "@/actions/cards";

export function DeleteCardButton({ cardId }: { cardId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    await deleteCard(cardId);
    router.push("/cards");
  };

  if (confirming) {
    return (
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={deleting}>
          Cancel
        </Button>
        <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting} className="gap-2">
          {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          Confirm
        </Button>
      </div>
    );
  }

  return (
    <Button variant="ghost" size="icon" onClick={() => setConfirming(true)} className="text-muted-foreground hover:text-destructive">
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
