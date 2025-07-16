const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

// Initialize Gemini AI with the provided API key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Get the Gemini model
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// Generate response from Gemini
async function generateResponse(userMessage, conversationHistory = []) {
  try {
    logger.info('Generating Gemini response for message:', userMessage);

    // Prepare chat context
    let prompt = userMessage;
    
    // Add conversation history if available
    if (conversationHistory.length > 0) {
      const context = conversationHistory
        .map(msg => `${msg.message_type === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n');
      prompt = `Previous conversation:\n${context}\n\nUser: ${userMessage}`;
    }

    // Generate response
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    logger.info('Gemini response generated successfully');
    return text;
  } catch (error) {
    logger.error('Error generating Gemini response:', error);
    
    // Return a fallback response
    return 'I apologize, but I encountered an error while processing your request. Please try again later.';
  }
}

// Generate response with conversation context
async function generateResponseWithContext(userMessage, chatroomId, pool) {
  try {
    // Get recent conversation history (last 10 messages)
    const historyResult = await pool.query(`
      SELECT content, message_type, created_at
      FROM messages
      WHERE chatroom_id = $1 AND status = 'completed'
      ORDER BY created_at DESC
      LIMIT 10
    `, [chatroomId]);

    const conversationHistory = historyResult.rows.reverse(); // Reverse to get chronological order

    return await generateResponse(userMessage, conversationHistory);
  } catch (error) {
    logger.error('Error generating response with context:', error);
    return await generateResponse(userMessage); // Fallback without context
  }
}

// Analyze sentiment of user message
async function analyzeSentiment(message) {
  try {
    const prompt = `Analyze the sentiment of this message and respond with only one word: positive, negative, or neutral.
    
    Message: "${message}"`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const sentiment = response.text().trim().toLowerCase();

    return sentiment;
  } catch (error) {
    logger.error('Error analyzing sentiment:', error);
    return 'neutral';
  }
}

// Summarize conversation
async function summarizeConversation(messages) {
  try {
    const conversation = messages
      .map(msg => `${msg.message_type === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n');

    const prompt = `Please provide a brief summary of this conversation in 2-3 sentences:

    ${conversation}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const summary = response.text();

    return summary;
  } catch (error) {
    logger.error('Error summarizing conversation:', error);
    return 'Unable to generate summary at this time.';
  }
}

// Generate chatroom title from first message
async function generateChatroomTitle(firstMessage) {
  try {
    const prompt = `Generate a short, descriptive title (maximum 50 characters) for a chatroom based on this first message. Only respond with the title, no additional text:

    "${firstMessage}"`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const title = response.text().trim();

    return title.length > 50 ? title.substring(0, 50) + '...' : title;
  } catch (error) {
    logger.error('Error generating chatroom title:', error);
    return 'New Conversation';
  }
}

module.exports = {
  generateResponse,
  generateResponseWithContext,
  analyzeSentiment,
  summarizeConversation,
  generateChatroomTitle
};
