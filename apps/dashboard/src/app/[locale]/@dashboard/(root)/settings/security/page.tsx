import { MfaSettingsList } from "@/components/mfa-settings-list";
import { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Security | Midday",
};

export default async function Security() {
  return (
    <Suspense>
      <MfaSettingsList />
    </Suspense>
  );
}