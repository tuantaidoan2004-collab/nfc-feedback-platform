export const topics = ['wait', 'cut', 'staff', 'space', 'other'] as const;
export type Topic = typeof topics[number];
export const copy = {
  vi: {
    invite: 'Thật tuyệt nếu nhận được đánh giá của bạn trên:', thanks: 'Chúng tôi sẽ rất cảm kích nếu nhận được đánh giá Google của bạn.',
    topic: 'Điều bạn muốn chia sẻ', message: 'Góp ý của bạn', placeholder: 'Bạn kể cụ thể hơn cho chúng tôi nhé…', send: 'Gửi góp ý',
    privateNote: 'Góp ý này không đăng lên Google.', stars: 'sao',
    wait: 'Thời gian chờ', cut: 'Chất lượng cắt tóc', staff: 'Thái độ phục vụ', space: 'Không gian / vệ sinh', other: 'Khác',
  },
  en: {
    invite: 'We would love to hear your review on:', thanks: 'We would really appreciate your Google review.',
    topic: 'What would you like to share?', message: 'Your feedback', placeholder: 'Tell us a little more about your experience…', send: 'Send feedback',
    privateNote: 'This feedback is not posted on Google.', stars: 'stars',
    wait: 'Waiting time', cut: 'Haircut quality', staff: 'Staff service', space: 'Space / cleanliness', other: 'Other',
  },
} as const;
export type Language = keyof typeof copy;
