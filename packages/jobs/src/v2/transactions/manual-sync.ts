import { processPromisesBatch } from "@/utils/process";
import { Provider } from "@midday/providers";
import { eventTrigger } from "@trigger.dev/sdk";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { Events, Jobs } from "../..//constants";
import { client, supabase } from "../../client";
import { scheduler } from "../../transactions";

const BATCH_LIMIT = 300;

client.defineJob({
  id: Jobs.TRANSACTIONS_MANUAL_SYNC,
  name: "Transactions - Manual Sync",
  version: "0.0.1",
  trigger: eventTrigger({
    name: Events.TRANSACTIONS_MANUAL_SYNC,
    schema: z.object({
      teamId: z.string(),
    }),
  }),
  integrations: { supabase },
  run: async (payload, io) => {
    const supabase = await io.supabase.client;

    const { teamId } = payload;

    try {
      // Schedule a background per team
      await scheduler.register(teamId, {
        type: "interval",
        options: {
          seconds: 3600, // every 1h
        },
      });
    } catch (error) {
      await io.logger.debug(`Error register new scheduler ${teamId}`);
    }

    const { data: accountsData } = await supabase
      .from("bank_accounts")
      .select(
        "id, team_id, account_id, bank_connection:bank_connection_id(provider, access_token, enrollment_id)"
      )
      .eq("team_id", teamId)
      .eq("enabled", true);

    const promises = accountsData?.map(async (account) => {
      const provider = new Provider({
        provider: account.bank_connection.provider,
      });

      const transactions = await provider.getTransactions({
        teamId: account.team_id,
        accountId: account.account_id,
        accessToken: account.bank_connection?.access_token,
      });

      // NOTE: We will get all the transactions at once for each account so
      // we need to guard against massive payloads
      await processPromisesBatch(transactions, BATCH_LIMIT, async (batch) => {
        // await supabase.from("transactions").upsert(batch, {
        //   onConflict: "internal_id",
        //   ignoreDuplicates: true,
        // });
      });
    });

    try {
      await Promise.all(promises);
    } catch (error) {
      await io.logger.error(error);
      throw Error("Something went wrong");
    }

    revalidateTag(`bank_connections_${teamId}`);
    revalidateTag(`transactions_${teamId}`);
    revalidateTag(`spending_${teamId}`);
    revalidateTag(`metrics_${teamId}`);
    revalidateTag(`bank_accounts_${teamId}`);
    revalidateTag(`insights_${teamId}`);
  },
});
