import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { LogOut, Trash2, Loader2, UserRound, ShieldCheck } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Disclaimer } from "@/components/disclaimer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [deleting, setDeleting] = useState(false);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await apiClient.deleteAccount();
      await supabase.auth.signOut();
      toast.success("Your account has been deleted.");
      navigate({ to: "/auth", replace: true });
    } catch (err) {
      setDeleting(false);
      toast.error(
        err instanceof ApiError ? err.message : "Could not delete your account. Please try again.",
      );
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your account.</p>
      </div>

      <Card className="p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <UserRound className="h-4.5 w-4.5 text-accent" />
          Account
        </h2>
        <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-3">
          <div>
            <p className="text-xs text-muted-foreground">Signed in as</p>
            <p className="text-sm font-medium text-foreground">{user?.email ?? "—"}</p>
          </div>
        </div>
        <Button variant="outline" className="mt-4 w-full sm:w-auto" onClick={signOut}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </Card>

      <Card className="border-destructive/40 p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-destructive">
          <ShieldCheck className="h-4.5 w-4.5" />
          Danger zone
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Deleting your account permanently removes your documents and data. This cannot be undone.
        </p>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="mt-4 w-full sm:w-auto" disabled={deleting}>
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete your account and all stored documents. This action
                cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  deleteAccount();
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete permanently
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>

      <Disclaimer />
    </div>
  );
}
