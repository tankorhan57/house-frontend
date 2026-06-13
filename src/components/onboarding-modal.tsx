import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { apiClient, ApiError, type Profile } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

function flagKey(userId: string) {
  return `house:onboarding:${userId}`;
}

/** Shown once on first login when the user has no profile yet. */
export function OnboardingModal({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const dismissed =
    typeof window !== "undefined" && window.localStorage.getItem(flagKey(userId)) === "1";

  const { data, isSuccess } = useQuery({
    queryKey: ["profile"],
    queryFn: () => apiClient.getProfile(),
    enabled: !dismissed,
    retry: false,
  });

  useEffect(() => {
    if (dismissed || !isSuccess) return;
    const hasProfile =
      data != null &&
      (data.age != null ||
        data.sex ||
        data.chronic_conditions ||
        data.current_medications ||
        data.allergies ||
        data.lifestyle_notes);
    if (!hasProfile) setOpen(true);
  }, [data, isSuccess, dismissed]);

  const finish = () => {
    try {
      window.localStorage.setItem(flagKey(userId), "1");
    } catch {
      /* ignore storage errors */
    }
    setOpen(false);
  };

  const mutation = useMutation({
    mutationFn: (payload: Profile) => apiClient.saveProfile(payload),
    onSuccess: (saved) => {
      queryClient.setQueryData(["profile"], saved);
      queryClient.invalidateQueries({ queryKey: ["score"] });
      queryClient.invalidateQueries({ queryKey: ["insights"] });
      toast.success("Profile saved.");
      finish();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not save your profile.");
    },
  });

  const update = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
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
    <Dialog open={open} onOpenChange={(v) => !v && finish()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Complete your Health Profile</DialogTitle>
          <DialogDescription>
            All fields are optional, but they help tailor your insights. You can edit this anytime
            from your Profile.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="onb-age">Age</Label>
              <Input
                id="onb-age"
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
              <Label htmlFor="onb-sex">Sex</Label>
              <Select value={form.sex} onValueChange={(v) => update("sex", v)}>
                <SelectTrigger id="onb-sex">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="onb-chronic">Chronic conditions</Label>
            <Textarea
              id="onb-chronic"
              placeholder="e.g. Type 2 diabetes, hypertension"
              rows={2}
              value={form.chronic_conditions}
              onChange={(e) => update("chronic_conditions", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="onb-meds">Current medications</Label>
            <Textarea
              id="onb-meds"
              placeholder="e.g. Metformin 500mg, Lisinopril 10mg"
              rows={2}
              value={form.current_medications}
              onChange={(e) => update("current_medications", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="onb-allergies">Allergies</Label>
            <Textarea
              id="onb-allergies"
              placeholder="e.g. Penicillin, peanuts"
              rows={2}
              value={form.allergies}
              onChange={(e) => update("allergies", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="onb-lifestyle">Lifestyle notes</Label>
            <Textarea
              id="onb-lifestyle"
              placeholder="e.g. Non-smoker, exercises 3×/week, vegetarian"
              rows={3}
              value={form.lifestyle_notes}
              onChange={(e) => update("lifestyle_notes", e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={finish} disabled={mutation.isPending}>
            Skip for now
          </Button>
          <Button onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
