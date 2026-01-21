import app from '../src/app';
import { prisma } from '../src/config/prisma';

function pickFirstItem(data: any) {
  if (Array.isArray(data)) return data[0] ?? null;
  if (Array.isArray(data?.items)) return data.items[0] ?? null;
  if (Array.isArray(data?.data)) return data.data[0] ?? null;
  if (Array.isArray(data?.data?.items)) return data.data.items[0] ?? null;
  return null;
}

async function getOrCreateLivingLive(baseUrl: string, token: string) {
  // Try existing lives first
  const listResp = await fetch(`${baseUrl}/api/live?status=LIVING&page=1&pageSize=5`, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  }).catch(() => null as any);

  if (listResp?.ok) {
    const listJson: any = await listResp.json().catch(() => null);
    const items =
      (Array.isArray(listJson?.data) ? listJson.data : null) ??
      (Array.isArray(listJson?.data?.items) ? listJson.data.items : null) ??
      (Array.isArray(listJson?.items) ? listJson.items : null) ??
      (Array.isArray(listJson) ? listJson : null) ??
      [];

    const living = items.find((x: any) => x?.status === 'LIVING');
    if (living?.id) return Number(living.id);
  }

  const anchor = await prisma.volunteerProfile.findFirst({ select: { userId: true, collegeId: true } });
  if (!anchor) throw new Error('no volunteerProfile found to create LIVING live');

  const now = new Date();
  const planStartTime = new Date(now.getTime() - 60 * 1000);
  const planEndTime = new Date(now.getTime() + 60 * 60 * 1000);

  const created = await prisma.liveRoom.create({
    data: {
      title: `smoke_living_${Date.now()}`,
      intro: 'smoke living live for moderation',
      planStartTime,
      planEndTime,
      actualStart: now,
      status: 'LIVING',
      anchorId: anchor.userId,
      collegeId: anchor.collegeId,
    },
    select: { id: true },
  });

  return created.id;
}

async function main() {
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1) Login as seeded platform admin
    const loginResp = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'platform_admin', password: 'Passw0rd!' }),
    });

    const loginJson: any = await loginResp.json();
    if (!loginResp.ok) {
      throw new Error(`login failed: ${loginResp.status} ${JSON.stringify(loginJson)}`);
    }

    const token = loginJson?.data?.token;
    if (!token) {
      throw new Error(`login response missing token: ${JSON.stringify(loginJson)}`);
    }

    const authHeaders = {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    } as any;

    // 2) Ensure policy is enabled + REJECT mode
    const policy1 = await fetch(`${baseUrl}/api/platform/content-policy`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ commentsEnabled: true, liveChatEnabled: true, moderationAction: 'REJECT' }),
    });
    const policy1Json: any = await policy1.json();
    if (!policy1.ok) throw new Error(`policy update failed: ${policy1.status} ${JSON.stringify(policy1Json)}`);

    // 3) Add a sensitive word
    const word = `badword_${Date.now()}`;
    const addResp = await fetch(`${baseUrl}/api/platform/sensitive-words`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ word }),
    });
    const addJson: any = await addResp.json();
    if (!addResp.ok) throw new Error(`add word failed: ${addResp.status} ${JSON.stringify(addJson)}`);

    // 3.1) Import/Export smoke (TXT)
    {
      const importWord = `import_${Date.now()}`;
      const fd = new FormData();
      fd.append('file', new Blob([`${importWord}\n`], { type: 'text/plain' }), 'words.txt');

      const importResp = await fetch(`${baseUrl}/api/platform/sensitive-words/import?format=txt&overwrite=false`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: fd,
      });
      const importJson: any = await importResp.json().catch(() => null);
      if (importResp.status !== 201) {
        throw new Error(`expected import 201, got ${importResp.status} ${JSON.stringify(importJson)}`);
      }

      const exportResp = await fetch(`${baseUrl}/api/platform/sensitive-words/export?format=txt`, {
        method: 'GET',
        headers: { authorization: `Bearer ${token}` },
      });
      const exportText = await exportResp.text();
      if (exportResp.status !== 200) {
        throw new Error(`expected export 200, got ${exportResp.status} ${exportText}`);
      }
      if (!exportText.includes(importWord)) {
        throw new Error(`expected exported txt contains imported word, missing: ${importWord}`);
      }
    }

    // 4) Find a published video to comment on
    const videosResp = await fetch(`${baseUrl}/api/videos?status=PUBLISHED&page=1&pageSize=1`, {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
    });
    const videosJson: any = await videosResp.json();
    if (!videosResp.ok) throw new Error(`list videos failed: ${videosResp.status} ${JSON.stringify(videosJson)}`);

    const first = pickFirstItem(videosJson?.data);
    const videoId = first?.id;
    if (!videoId) {
      throw new Error(`no published video found for comment smoke. videos=${JSON.stringify(videosJson?.data)}`);
    }

    // 5) Comment with sensitive word should be rejected (REJECT)
    const commentRejectResp = await fetch(`${baseUrl}/api/videos/${videoId}/comments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ content: `hello ${word} world` }),
    });
    const commentRejectJson: any = await commentRejectResp.json().catch(() => null);
    if (commentRejectResp.status !== 400) {
      throw new Error(`expected comment reject 400, got ${commentRejectResp.status} ${JSON.stringify(commentRejectJson)}`);
    }

    // 6) Switch to MASK
    const policy2 = await fetch(`${baseUrl}/api/platform/content-policy`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ moderationAction: 'MASK' }),
    });
    const policy2Json: any = await policy2.json();
    if (!policy2.ok) throw new Error(`policy update failed: ${policy2.status} ${JSON.stringify(policy2Json)}`);

    // 7) Comment should succeed and be masked
    const commentMaskResp = await fetch(`${baseUrl}/api/videos/${videoId}/comments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ content: `hello ${word} world` }),
    });
    const commentMaskJson: any = await commentMaskResp.json();
    if (commentMaskResp.status !== 201) {
      throw new Error(`expected comment create 201, got ${commentMaskResp.status} ${JSON.stringify(commentMaskJson)}`);
    }
    const savedContent: string | undefined = commentMaskJson?.data?.content;
    if (typeof savedContent !== 'string' || savedContent.includes(word)) {
      throw new Error(`expected masked comment content, got: ${savedContent}`);
    }

    // 8) Disable comments and ensure blocked
    const policy3 = await fetch(`${baseUrl}/api/platform/content-policy`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ commentsEnabled: false }),
    });
    const policy3Json: any = await policy3.json();
    if (!policy3.ok) throw new Error(`policy update failed: ${policy3.status} ${JSON.stringify(policy3Json)}`);

    const commentDisabledResp = await fetch(`${baseUrl}/api/videos/${videoId}/comments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ content: 'hello' }),
    });
    const commentDisabledJson: any = await commentDisabledResp.json().catch(() => null);
    if (commentDisabledResp.status !== 403) {
      throw new Error(
        `expected comment disabled 403, got ${commentDisabledResp.status} ${JSON.stringify(commentDisabledJson)}`
      );
    }

    // 9) Live chat switch smoke (弹幕开关)
    const liveId = await getOrCreateLivingLive(baseUrl, token);

    // Disable live chat: CHAT should be blocked, QA should still pass
    const policy4 = await fetch(`${baseUrl}/api/platform/content-policy`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ liveChatEnabled: false }),
    });
    const policy4Json: any = await policy4.json();
    if (!policy4.ok) throw new Error(`policy update failed: ${policy4.status} ${JSON.stringify(policy4Json)}`);

    const chatDisabledResp = await fetch(`${baseUrl}/api/live/${liveId}/messages`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ type: 'CHAT', content: 'hello' }),
    });
    const chatDisabledJson: any = await chatDisabledResp.json().catch(() => null);
    if (chatDisabledResp.status !== 403) {
      throw new Error(
        `expected live chat disabled 403, got ${chatDisabledResp.status} ${JSON.stringify(chatDisabledJson)}`
      );
    }

    const qaResp = await fetch(`${baseUrl}/api/live/${liveId}/messages`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ type: 'QA', content: 'question?' }),
    });
    const qaJson: any = await qaResp.json().catch(() => null);
    if (qaResp.status !== 201) {
      throw new Error(`expected QA 201 even when chat disabled, got ${qaResp.status} ${JSON.stringify(qaJson)}`);
    }

    // Enable live chat: CHAT should pass and be masked (we are currently in MASK mode)
    const policy5 = await fetch(`${baseUrl}/api/platform/content-policy`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ liveChatEnabled: true }),
    });
    const policy5Json: any = await policy5.json();
    if (!policy5.ok) throw new Error(`policy update failed: ${policy5.status} ${JSON.stringify(policy5Json)}`);

    const chatMaskResp = await fetch(`${baseUrl}/api/live/${liveId}/messages`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ type: 'CHAT', content: `hello ${word} world` }),
    });
    const chatMaskJson: any = await chatMaskResp.json().catch(() => null);
    if (chatMaskResp.status !== 201) {
      throw new Error(`expected live chat 201, got ${chatMaskResp.status} ${JSON.stringify(chatMaskJson)}`);
    }
    const savedLiveContent: string | undefined = chatMaskJson?.data?.content;
    if (typeof savedLiveContent !== 'string' || savedLiveContent.includes(word)) {
      throw new Error(`expected masked live chat content, got: ${savedLiveContent}`);
    }

    console.log('✅ moderation smoke success');
    console.log(
      JSON.stringify(
        {
          videoId,
          liveId,
          word,
          rejectStatus: commentRejectResp.status,
          maskedStatus: commentMaskResp.status,
          disabledStatus: commentDisabledResp.status,
          chatDisabledStatus: chatDisabledResp.status,
          qaStatus: qaResp.status,
          liveChatMaskedStatus: chatMaskResp.status,
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect().catch(() => null);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

main().catch((e) => {
  console.error('❌ moderation smoke failed');
  console.error(e);
  process.exitCode = 1;
});
