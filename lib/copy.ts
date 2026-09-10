export const topics = ['wait', 'cut', 'staff', 'space', 'other'] as const;
export type Topic = typeof topics[number];
export const copy = {
  vi: {
    event: 'ẢNH SỰ KIỆN CỦA SHOP', eventSub: 'Vị trí ảnh do shop lựa chọn', question: 'Trải nghiệm hôm nay của bạn thế nào?',
    invite: 'Thật tuyệt nếu nhận được đánh giá của bạn trên:', thanks: 'Chúng tôi sẽ rất cảm kích nếu nhận được đánh giá Google của bạn.',
    private: 'Gửi góp ý riêng cho quản lý', topic: 'Điều bạn muốn chia sẻ', message: 'Góp ý của bạn',
    placeholder: 'Bạn kể cụ thể hơn cho chúng tôi nhé…', send: 'Gửi góp ý', sent: 'Góp ý đã được lưu trong bản thử trên trình duyệt này.',
    saved: 'Đã ghi nhận trong bản thử', failure: 'Chưa lưu được. Bạn hãy cho phép lưu dữ liệu trình duyệt rồi thử lại.',
    empty: 'Bạn hãy nhập góp ý trước khi gửi.', tooLong: 'Góp ý tối đa 2.000 ký tự.', privateNote: 'Góp ý này không đăng lên Google.',
    zalo: 'Kết nối qua Zalo OA', instagram: 'Khám phá Instagram', booking: 'Đặt lịch lần tới',
    simulated: 'Nút thử — chưa có liên kết thật của shop.', wait: 'Thời gian chờ', cut: 'Chất lượng cắt tóc', staff: 'Thái độ phục vụ', space: 'Không gian / vệ sinh', other: 'Khác',
    stars: 'sao', demo: 'BẢN THỬ · DỮ LIỆU CHỈ LƯU TRÊN TRÌNH DUYỆT', owner: 'Xem dashboard mẫu', badge: 'Thương hiệu minh họa',
  },
  en: {
    event: 'YOUR SHOP’S EVENT IMAGE', eventSub: 'An image selected by the shop', question: 'How was your experience today?',
    invite: 'We would love to hear your review on:', thanks: 'We would really appreciate your Google review.',
    private: 'Send private feedback to the manager', topic: 'What would you like to share?', message: 'Your feedback',
    placeholder: 'Tell us a little more about your experience…', send: 'Send feedback', sent: 'Feedback saved in this browser demo.',
    saved: 'Recorded in this demo', failure: 'Could not save. Please enable browser storage and try again.',
    empty: 'Please enter your feedback before sending.', tooLong: 'Feedback is limited to 2,000 characters.', privateNote: 'This feedback is not posted on Google.',
    zalo: 'Connect on Zalo OA', instagram: 'Explore our Instagram', booking: 'Book your next visit',
    simulated: 'Demo button — no real shop link has been configured.', wait: 'Waiting time', cut: 'Haircut quality', staff: 'Staff service', space: 'Space / cleanliness', other: 'Other',
    stars: 'stars', demo: 'DEMO · DATA SAVED ONLY IN THIS BROWSER', owner: 'View sample dashboard', badge: 'Illustrative brand',
  },
} as const;
export type Language = keyof typeof copy;
