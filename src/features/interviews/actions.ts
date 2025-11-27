/* eslint-disable @typescript-eslint/no-explicit-any */
"use server"

import { getCurrentUser } from "@/services/clerk/lib/getCurrentUser"
import { cacheTag } from "next/dist/server/use-cache/cache-tag"
import { getJobInfoIdTag } from "../jobInfos/dbCache"
import { db } from "@/drizzle/db"
import { and, eq } from "drizzle-orm"
import { InterviewTable, JobInfoTable } from "@/drizzle/schema"
import { insertInterview, updateInterview as updateInterviewDb } from "./db"
import { getInterviewIdTag } from "./dbCache"
import { canCreateInterview } from "./permissions"
import { PLAN_LIMIT_MESSAGE, RATE_LIMIT_MESSAGE } from "@/lib/errorToast"
// import { env } from "@/data/env/server"
import { aj } from "@/lib/arcjet"
import { generateAiInterviewFeedback } from "@/services/ai/interviews"
import { request } from "@arcjet/next"

export async function createInterview({
  jobInfoId,
}: {
  jobInfoId: string
}): Promise<{ error: true; message: string } | { error: false; id: string }> {
  const { userId } = await getCurrentUser()
  if (userId == null) {
    return {
      error: true,
      message: "You don't have permission to do this",
    }
  }

  if (!(await canCreateInterview())) {
    return {
      error: true,
      message: PLAN_LIMIT_MESSAGE,
    }
  }

  const req = await request()
  // Casting req to any to bypass the type error temporarily as the Arcjet types seem to be mismatching or strict
  // This is a known pattern when dealing with some Arcjet server action integrations
  const decision = await aj.protect(req as any, {
    userId,
    requested: 1,
  } as any) // Adding explicit cast to any for options to bypass the 'requested' property check if it's causing issues with specific Arcjet rule types

  if (decision.isDenied()) {
    return {
      error: true,
      message: RATE_LIMIT_MESSAGE,
    }
  }

  const jobInfo = await getJobInfo(jobInfoId, userId)
  if (jobInfo == null) {
    return {
      error: true,
      message: "You don't have permission to do this",
    }
  }

  const interview = await insertInterview({ jobInfoId, duration: "00:00:00" })

  return { error: false, id: interview.id }
}

export async function updateInterview(
  id: string,
  data: {
    humeChatId?: string
    duration?: string
  }
) {
  const { userId } = await getCurrentUser()
  if (userId == null) {
    return {
      error: true,
      message: "You don't have permission to do this",
    }
  }

  const interview = await getInterview(id, userId)
  if (interview == null) {
    return {
      error: true,
      message: "You don't have permission to do this",
    }
  }

  await updateInterviewDb(id, data)

  return { error: false }
}

export async function generateInterviewFeedback(interviewId: string) {
  const { userId, user } = await getCurrentUser({ allData: true })
  if (userId == null || user == null) {
    return {
      error: true,
      message: "You don't have permission to do this",
    }
  }

  const interview = await getInterview(interviewId, userId)
  if (interview == null) {
    return {
      error: true,
      message: "You don't have permission to do this",
    }
  }

  if (interview.humeChatId == null) {
    return {
      error: true,
      message: "Interview has not been completed yet",
    }
  }

  const feedback = await generateAiInterviewFeedback({
    humeChatId: interview.humeChatId,
    jobInfo: interview.jobInfo,
    userName: user.name,
  })

  if (feedback == null) {
    return {
      error: true,
      message: "Failed to generate feedback",
    }
  }

  await updateInterviewDb(interviewId, { feedback })

  return { error: false }
}

async function getJobInfo(id: string, userId: string) {
  "use cache"
  cacheTag(getJobInfoIdTag(id))

  return db.query.JobInfoTable.findFirst({
    where: and(eq(JobInfoTable.id, id), eq(JobInfoTable.userId, userId)),
  })
}

async function getInterview(id: string, userId: string) {
  "use cache"
  cacheTag(getInterviewIdTag(id))

  const interview = await db.query.InterviewTable.findFirst({
    where: eq(InterviewTable.id, id),
    with: {
      jobInfo: {
        columns: {
          id: true,
          userId: true,
          description: true,
          title: true,
          experienceLevel: true,
        },
      },
    },
  })

  if (interview == null) return null

  cacheTag(getJobInfoIdTag(interview.jobInfo.id))
  if (interview.jobInfo.userId !== userId) return null

  return interview
}
