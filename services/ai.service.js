const { getDb } = require('../db');

const CHAT_COLLECTION = 'chat_store';

async function parseRecipe(text) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: `You are a nutrition expert. Parse the user's recipe/food description into individual food items with accurate macros. Return ONLY valid JSON array with no markdown. Each item must have: name (string), servingSize (number), servingUnit (string: g/ml/piece/cup/tbsp/tsp/oz/serving), calories (number), protein (number in grams), carbs (number in grams), fat (number in grams), fiber (number in grams), sugar (number in grams), sodium (number in mg). Be accurate with Indian foods, common recipes, and standard nutritional values. Always return realistic macro estimates.`,
        },
        {
          role: 'user',
          content: text.trim(),
        },
      ],
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    const err = new Error('OpenAI API error');
    err.status = 502;
    err.details = details;
    throw err;
  }

  const data = await response.json();
  const content = data.choices[0].message.content.trim();

  // Parse the JSON from the response, stripping markdown fences if present
  const jsonStr = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  return JSON.parse(jsonStr);
}

async function chat(userId, message, context) {
  const db = getDb();

  // Load stored conversation history (last 20 messages for context window)
  const convDoc = await db.collection(CHAT_COLLECTION).findOne(
    { userId },
    { projection: { messages: { $slice: -20 }, _id: 0 } },
  );
  const history = convDoc?.messages || [];

  // Build a rich system prompt using the user's profile, goals, and today's log
  const profile = context?.profile || {};
  const goals = context?.goals || {};
  const todayLog = context?.todayLog || {};

  const profileLines = [];
  if (profile.name) profileLines.push(`Name: ${profile.name}`);
  if (profile.age) profileLines.push(`Age: ${profile.age}`);
  if (profile.gender) profileLines.push(`Gender: ${profile.gender}`);
  if (profile.weight && profile.weightUnit) profileLines.push(`Weight: ${profile.weight} ${profile.weightUnit}`);
  if (profile.height && profile.heightUnit) profileLines.push(`Height: ${profile.height} ${profile.heightUnit}`);
  if (profile.activityLevel) profileLines.push(`Activity level: ${profile.activityLevel}`);

  const goalLines = [];
  if (goals.calories) goalLines.push(`Calorie goal: ${goals.calories} kcal`);
  if (goals.protein) goalLines.push(`Protein goal: ${goals.protein}g`);
  if (goals.carbs) goalLines.push(`Carbs goal: ${goals.carbs}g`);
  if (goals.fat) goalLines.push(`Fat goal: ${goals.fat}g`);
  if (goals.fiber) goalLines.push(`Fiber goal: ${goals.fiber}g`);

  const logLines = [];
  if (todayLog.meals?.length) {
    const totalCals = todayLog.meals.reduce((sum, m) =>
      sum + m.items.reduce((s, i) => s + (i.macros?.calories || 0), 0), 0);
    const totalProtein = todayLog.meals.reduce((sum, m) =>
      sum + m.items.reduce((s, i) => s + (i.macros?.protein || 0), 0), 0);
    logLines.push(`Calories logged today: ${Math.round(totalCals)} kcal`);
    logLines.push(`Protein logged today: ${Math.round(totalProtein)}g`);
    logLines.push(`Meals logged: ${todayLog.meals.map(m => m.name).join(', ')}`);
  }
  if (todayLog.waterIntake) logLines.push(`Water today: ${todayLog.waterIntake}L`);

  const systemPrompt = `You are Milo, a friendly and knowledgeable AI nutrition and fitness assistant built into the MacroTracker app. Your goal is to help users understand their nutrition, fitness progress, and health metrics in a clear and motivating way.

    ${profileLines.length ? `User profile:\n${profileLines.join('\n')}` : ''}
    ${goalLines.length ? `\nUser goals:\n${goalLines.join('\n')}` : ''}
    ${logLines.length ? `\nToday's data:\n${logLines.join('\n')}` : ''}

    Guidelines:
    - Be conversational, warm, and encouraging
    - Give personalized answers based on the user's profile and data above
    - Calculate BMI, TDEE, macro ratios, and other metrics on request using the provided data
    - If profile data is missing for a calculation, politely ask for it
    - Keep responses concise (2-4 sentences) unless a detailed explanation is needed
    - Use numbers and specifics wherever possible
    - Never give medical diagnoses — always recommend consulting a healthcare professional for medical concerns`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 400,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message.trim() },
      ],
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    const err = new Error('OpenAI API error');
    err.status = 502;
    err.details = details;
    throw err;
  }

  const data = await response.json();
  const reply = data.choices[0].message.content.trim();

  // Append new turn to the user's conversation (cap at 100 messages)
  await db.collection(CHAT_COLLECTION).updateOne(
    { userId },
    {
      $push: {
        messages: {
          $each: [
            { role: 'user', content: message.trim() },
            { role: 'assistant', content: reply },
          ],
          $slice: -100,
        },
      },
      $set: { updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );

  return reply;
}

module.exports = { parseRecipe, chat };
