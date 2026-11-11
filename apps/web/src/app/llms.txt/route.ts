import { llmsTxt, textResponse } from '@/lib/llms';

export const revalidate = 3600;

export function GET() {
  return textResponse(llmsTxt());
}
