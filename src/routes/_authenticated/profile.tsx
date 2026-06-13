import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save, UserRound, AlertCircle } from "lucide-react";
import { apiClient, ApiError, type Profile } from "@/lib/api";
import { Disclaimer } from "@/components/disclaimer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

type FormState = {
  age: string;
  sex: string;
  chronic_conditions: string;
  current_medications: string;
  allergies: string;
  lifestyle_notes: string;
};

const EMPTY: FormState = {
  age: "",
  sex: "",
  chronic_conditions: "",
  current_medications: "",
  allergies: "",
  lifestyle_notes: "",
};

function toForm(p?: Profile): FormState {
  if (!p) return EMPTY;
  return {
    age: p.age != null ? String(p.age) : "",
    sex: p.sex ?? "",
    chronic_conditions: p.chronic_conditions ?? "",
    current_medications: p.current_medications ?? "",
    allergies: p.allergies ?? "",
    lifestyle_notes: p.lifestyle_notes ?? "",
  };
}

function ProfilePage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["profile"],
    queryFn: () => apiClient.getProfile(),
  });

  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);

  const mutation = useMutation({
    mutationFn: (payload: Profile) => apiClient.saveProfile(payload),
    onSuccess: (saved) => {
      queryClient.setQueryData(["profile"], saved);
      queryClient.invalidateQueries({ queryKey: ["score"] });
      queryClient.invalidateQueries({ queryKey: ["insights"] });
      toast.success("Profile saved.");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not save your profile.");
    },
  });

  const update = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ageNum = form.age.trim() === "" ? null : Number(form.age);
    if (ageNum != null && (Number.isNaN(ageNum) || ageNum < 0 || ageNum > 120)) {
      toast.error("Please enter a valid age (0–120).");
      return;
    }
    mutation.mutate({
      age: ageNum,
      sex: form.sex || null,
      chronic_conditions: form.chronic_conditions.trim() || null,
      current_medications: form.current_medications.trim() || null,
      allergies: form.allergies.trim() || null,
      lifestyle_notes: form.lifestyle_notes.trim() || null,
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Health profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This information helps tailor your insights and health score.
        </p>
      </div>

      {isLoading ? (
        <Card className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your profile…
        </Card>
      ) : isError ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Could not load your profile."}
          </p>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            Try again
          </Button>
        </Card>
      ) : (
        <form onSubmit={handleSubmit}>
          <Card className="space-y-5 p-6">
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <UserRound className="h-4.5 w-4.5 text-accent" />
              About you
            </h2>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={120}
                  placeholder="e.g. 42"
                  value={form.age}
                  onChange={(e) => update("age", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sex">Sex</Label>
                <Select value={form.sex} onValueChange={(v) => update("sex", v)}>
                  <SelectTrigger id="sex">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="intersex">Intersex</SelectItem>
                    <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="chronic_conditions">Chronic conditions</Label>
              <Textarea
                id="chronic_conditions"
                placeholder="e.g. Type 2 diabetes, hypertension"
                rows={2}
                value={form.chronic_conditions}
                onChange={(e) => update("chronic_conditions", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="current_medications">Current medications</Label>
              <Textarea
                id="current_medications"
                placeholder="e.g. Metformin 500mg, Lisinopril 10mg"
                rows={2}
                value={form.current_medications}
                onChange={(e) => update("current_medications", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="allergies">Allergies</Label>
              <Textarea
                id="allergies"
                placeholder="e.g. Penicillin, peanuts"
                rows={2}
                value={form.allergies}
                onChange={(e) => update("allergies", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lifestyle_notes">Lifestyle notes</Label>
              <Textarea
                id="lifestyle_notes"
                placeholder="e.g. Non-smoker, exercises 3×/week, vegetarian"
                rows={3}
                value={form.lifestyle_notes}
                onChange={(e) => update("lifestyle_notes", e.target.value)}
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save profile
              </Button>
            </div>
          </Card>
        </form>
      )}

      <Disclaimer />
    </div>
  );
}
