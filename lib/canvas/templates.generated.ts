// Sinh bởi `node scripts/templates.mjs` từ templates/*/template.json — đừng sửa tay.
import type { CanvasTemplate } from './templates';

export const CANVAS_TEMPLATES: readonly CanvasTemplate[] = [
 {
  "key": "khong-gian-that",
  "number": 1,
  "name": "Không gian thật",
  "groups": [
   "Không gian thực",
   "Thuỷ tinh"
  ],
  "about": "Ảnh thật của quán làm nền, biển hiệu khung vàng, thẻ kính mờ chứa nút Google và mạng xã hội, ảnh polaroid nghiêng.",
  "doc": {
   "v": 1,
   "sections": [
    {
     "id": "a",
     "name": "Khúc A",
     "h": 740,
     "bg": {
      "src": "art:barber",
      "gray": true
     },
     "els": [
      {
       "id": "cau-vong",
       "t": "image",
       "x": -30,
       "y": -10,
       "w": 330,
       "h": 250,
       "src": "art:prism",
       "o": 0.85,
       "motion": {
        "in": "fade",
        "at": 600
       }
      },
      {
       "id": "bien",
       "t": "shape",
       "shape": "rect",
       "x": 96,
       "y": 40,
       "w": 198,
       "h": 143,
       "radius": 4,
       "fill": {
        "kind": "linear",
        "angle": 180,
        "stops": [
         [
          "#2b2118",
          0
         ],
         [
          "#140e09",
          100
         ]
        ]
       },
       "edge": {
        "w": 7,
        "color": {
         "kind": "linear",
         "angle": 135,
         "stops": [
          [
           "#f6e19a",
           0
          ],
          [
           "#b98a2e",
           30
          ],
          [
           "#fff1b8",
           50
          ],
          [
           "#a3741f",
           72
          ],
          [
           "#f3d27a",
           100
          ]
         ]
        }
       },
       "shadow": {
        "x": 0,
        "y": 12,
        "blur": 30,
        "color": "#000000aa"
       },
       "motion": {
        "in": "drop",
        "at": 100
       }
      },
      {
       "id": "ten-quan",
       "t": "text",
       "x": 104,
       "y": 58,
       "w": 182,
       "h": 56,
       "words": {
        "vi": "TÊN QUÁN"
       },
       "font": "slab",
       "size": 34,
       "color": "#f4efe6",
       "spacing": 4,
       "shadow": {
        "x": 0,
        "y": 2,
        "blur": 0,
        "color": "#00000099"
       },
       "motion": {
        "in": "fade",
        "at": 300
       },
       "slot": "name"
      },
      {
       "id": "gach",
       "t": "shape",
       "shape": "line",
       "x": 130,
       "y": 120,
       "w": 130,
       "h": 1.6,
       "fill": "#e8d9b8",
       "motion": {
        "in": "fade",
        "at": 400
       }
      },
      {
       "id": "nganh",
       "t": "text",
       "x": 104,
       "y": 127,
       "w": 182,
       "h": 30,
       "words": {
        "vi": "BARBERSHOP"
       },
       "font": "display",
       "size": 16,
       "color": "#f4efe6",
       "weight": 700,
       "spacing": 24,
       "motion": {
        "in": "fade",
        "at": 450
       }
      },
      {
       "id": "the-kinh",
       "t": "shape",
       "shape": "rect",
       "x": 52,
       "y": 204,
       "w": 286,
       "h": 312,
       "radius": 28,
       "glass": {
        "blur": 12,
        "tint": "#ffffff33"
       },
       "edge": {
        "w": 1.2,
        "color": "#ffffff70"
       },
       "shadow": {
        "x": 0,
        "y": 18,
        "blur": 40,
        "color": "#00000066"
       },
       "motion": {
        "in": "rise",
        "at": 200
       }
      },
      {
       "id": "google",
       "t": "google",
       "look": "maps",
       "x": 78,
       "y": 236,
       "w": 236,
       "h": 46,
       "shadow": "soft",
       "motion": {
        "in": "pop",
        "at": 500
       }
      },
      {
       "id": "cam-on",
       "t": "text",
       "x": 74,
       "y": 286,
       "w": 244,
       "h": 32,
       "words": {
        "vi": "Chúng tôi sẽ rất cảm kích nếu nhận được đánh giá Google của bạn.",
        "en": "We would really appreciate your Google review."
       },
       "font": "sans",
       "size": 11.5,
       "color": "#f4f4f4",
       "line": 1.35,
       "motion": {
        "in": "fade",
        "at": 650
       }
      },
      {
       "id": "polaroid",
       "t": "image",
       "x": 36,
       "y": 318,
       "w": 106,
       "h": 128,
       "r": -9,
       "src": "art:photo",
       "frame": "polaroid",
       "caption": {
        "vi": "@tenquan"
       },
       "motion": {
        "in": "left",
        "at": 750,
        "loop": "sway"
       }
      },
      {
       "id": "instagram",
       "t": "button",
       "look": "ring",
       "icon": "instagram",
       "label": {
        "vi": "instagram"
       },
       "link": "https://www.instagram.com/",
       "x": 148,
       "y": 326,
       "w": 170,
       "h": 30,
       "size": 14,
       "edge": {
        "w": 2.6,
        "color": {
         "kind": "linear",
         "angle": 90,
         "stops": [
          [
           "#f9ce34",
           0
          ],
          [
           "#ee2a7b",
           50
          ],
          [
           "#6228d7",
           100
          ]
         ]
        }
       },
       "motion": {
        "in": "right",
        "at": 800
       },
       "slot": "instagram"
      },
      {
       "id": "tiktok",
       "t": "button",
       "look": "ring",
       "icon": "tiktok",
       "label": {
        "vi": "TikTok"
       },
       "link": "https://www.tiktok.com/",
       "x": 148,
       "y": 366,
       "w": 170,
       "h": 30,
       "size": 14,
       "edge": {
        "w": 2.6,
        "color": {
         "kind": "linear",
         "angle": 90,
         "stops": [
          [
           "#25f4ee",
           0
          ],
          [
           "#fe2c55",
           100
          ]
         ]
        }
       },
       "motion": {
        "in": "right",
        "at": 880
       },
       "slot": "tiktok"
      },
      {
       "id": "zalo",
       "t": "button",
       "look": "outline",
       "icon": "zalo",
       "label": {
        "vi": "Zalo OA"
       },
       "link": "https://zalo.me/",
       "x": 170,
       "y": 408,
       "w": 126,
       "h": 32,
       "size": 14,
       "edge": {
        "w": 2.2,
        "color": "#1f5bff"
       },
       "motion": {
        "in": "right",
        "at": 960
       },
       "slot": "zalo"
      },
      {
       "id": "vien",
       "t": "shape",
       "shape": "rect",
       "x": 78,
       "y": 458,
       "w": 240,
       "h": 46,
       "radius": 23,
       "glass": {
        "blur": 10,
        "tint": "#ffffff55"
       },
       "edge": {
        "w": 1,
        "color": "#ffffff66"
       },
       "motion": {
        "in": "rise",
        "at": 1000
       }
      },
      {
       "id": "ten-quan-ky",
       "t": "text",
       "x": 86,
       "y": 458,
       "w": 96,
       "h": 46,
       "words": {
        "vi": "Tên Quán"
       },
       "font": "script",
       "size": 26,
       "color": "#141414",
       "r": -6,
       "motion": {
        "in": "fade",
        "at": 1100
       },
       "slot": "name"
      },
      {
       "id": "website",
       "t": "button",
       "look": "link",
       "label": {
        "vi": "tenquan.vn"
       },
       "link": "https://quitesensational-review-bio.com/",
       "x": 186,
       "y": 468,
       "w": 96,
       "h": 26,
       "size": 15,
       "weight": 600,
       "fg": "#141414",
       "motion": {
        "in": "fade",
        "at": 1100
       },
       "slot": "website"
      },
      {
       "id": "link",
       "t": "icon",
       "icon": "link",
       "color": "#141414",
       "link": "https://quitesensational-review-bio.com/",
       "x": 284,
       "y": 469,
       "w": 24,
       "h": 24,
       "motion": {
        "in": "fade",
        "at": 1150
       },
       "slot": "website"
      },
      {
       "id": "gop-y",
       "t": "feedback",
       "x": 14,
       "y": 666,
       "w": 60,
       "h": 60,
       "icon": "plane",
       "color": "#229ED9",
       "edge": "#FFFFFF"
      }
     ]
    }
   ]
  }
 },
 {
  "key": "hien-dai",
  "number": 2,
  "name": "Hiện đại",
  "groups": [
   "Only Poster",
   "Tối giản"
  ],
  "about": "Nền đen, ánh cam ở góc, tên chữ thưa, sản phẩm lướt vào; nhãn đỏ \"Click here\" dẫn tới trang hậu mãi.",
  "doc": {
   "v": 1,
   "sections": [
    {
     "id": "a",
     "name": "Khúc A",
     "h": 600,
     "bg": {
      "fill": "#050506"
     },
     "els": [
      {
       "id": "anh-cam",
       "t": "shape",
       "shape": "glow",
       "x": -150,
       "y": -120,
       "w": 380,
       "h": 250,
       "fill": "#ff6a1a",
       "o": 0.9,
       "motion": {
        "in": "fade"
       }
      },
      {
       "id": "logo",
       "t": "icon",
       "icon": "car",
       "color": "#ffffff",
       "x": 160,
       "y": 40,
       "w": 70,
       "h": 30,
       "motion": {
        "in": "fade",
        "at": 150
       }
      },
      {
       "id": "dong-nho",
       "t": "text",
       "x": 50,
       "y": 96,
       "w": 290,
       "h": 18,
       "words": {
        "vi": "NEW LAUNCHING"
       },
       "font": "display",
       "size": 10.5,
       "color": "#d9d9d9",
       "spacing": 40,
       "motion": {
        "in": "fade",
        "at": 250
       }
      },
      {
       "id": "ten-quan",
       "t": "text",
       "x": 10,
       "y": 122,
       "w": 370,
       "h": 42,
       "words": {
        "vi": "TÊN QUÁN"
       },
       "font": "display",
       "size": 27,
       "color": "#ffffff",
       "weight": 300,
       "spacing": 44,
       "motion": {
        "in": "blur",
        "at": 350
       },
       "slot": "name"
      },
      {
       "id": "san-pham",
       "t": "image",
       "src": "art:car",
       "fit": "contain",
       "x": 24,
       "y": 150,
       "w": 350,
       "h": 220,
       "motion": {
        "in": "left",
        "at": 450
       }
      },
      {
       "id": "den-hau",
       "t": "shape",
       "shape": "glow",
       "x": 322,
       "y": 226,
       "w": 34,
       "h": 20,
       "fill": "#ff2a1a",
       "motion": {
        "loop": "twinkle"
       }
      },
      {
       "id": "google",
       "t": "google",
       "look": "maps",
       "x": 78,
       "y": 239,
       "w": 236,
       "h": 46,
       "shadow": "soft",
       "motion": {
        "in": "pop",
        "at": 700
       }
      },
      {
       "id": "cam-on",
       "t": "text",
       "x": 74,
       "y": 289,
       "w": 244,
       "h": 30,
       "words": {
        "vi": "Chúng tôi sẽ rất cảm kích nếu nhận được đánh giá Google của bạn.",
        "en": "We would really appreciate your Google review."
       },
       "font": "sans",
       "size": 11,
       "color": "#e8e8e8",
       "line": 1.35,
       "motion": {
        "in": "fade",
        "at": 800
       }
      },
      {
       "id": "hau-mai",
       "t": "button",
       "look": "tag",
       "tag": {
        "vi": "Click here"
       },
       "label": {
        "vi": "TENQUAN.VN – HẬU MÃI",
        "en": "TENQUAN.VN – AFTER-SALES"
       },
       "icon": "cursor",
       "link": "https://quitesensational-review-bio.com/",
       "x": 50,
       "y": 328,
       "w": 290,
       "h": 32,
       "size": 13.5,
       "weight": 800,
       "motion": {
        "in": "left",
        "at": 900
       },
       "slot": "website"
      },
      {
       "id": "tiktok",
       "t": "button",
       "look": "ring",
       "icon": "tiktok",
       "label": {
        "vi": "TikTok"
       },
       "link": "https://www.tiktok.com/",
       "x": 112,
       "y": 374,
       "w": 170,
       "h": 30,
       "size": 15,
       "edge": {
        "w": 2.6,
        "color": {
         "kind": "linear",
         "angle": 90,
         "stops": [
          [
           "#25f4ee",
           0
          ],
          [
           "#fe2c55",
           100
          ]
         ]
        }
       },
       "motion": {
        "in": "rise",
        "at": 1000
       },
       "slot": "tiktok"
      },
      {
       "id": "zalo",
       "t": "button",
       "look": "glow",
       "icon": "zalo",
       "label": {
        "vi": "Zalo OA"
       },
       "link": "https://zalo.me/",
       "x": 134,
       "y": 416,
       "w": 124,
       "h": 34,
       "size": 15,
       "motion": {
        "in": "rise",
        "at": 1080
       },
       "slot": "zalo"
      },
      {
       "id": "dich-vu",
       "t": "text",
       "x": 30,
       "y": 466,
       "w": 330,
       "h": 18,
       "words": {
        "vi": "CÁC DỊCH VỤ CỦA CHÚNG TÔI",
        "en": "OUR SERVICES"
       },
       "font": "display",
       "size": 11,
       "color": "#f2f2f2",
       "spacing": 30,
       "motion": {
        "in": "fade",
        "at": 1150
       }
      },
      {
       "id": "bang-gia",
       "t": "button",
       "look": "box",
       "label": {
        "vi": "PRICE"
       },
       "link": "https://quitesensational-review-bio.com/",
       "x": 146,
       "y": 492,
       "w": 98,
       "h": 24,
       "size": 10.5,
       "spacing": 40,
       "weight": 400,
       "fg": "#ffffff",
       "edge": {
        "w": 1,
        "color": "#ffffff"
       },
       "motion": {
        "in": "fade",
        "at": 1200
       },
       "slot": "menu"
      },
      {
       "id": "gop-y",
       "t": "feedback",
       "x": 14,
       "y": 526,
       "w": 60,
       "h": 60,
       "icon": "plane",
       "color": "#229ED9",
       "edge": "#FFFFFF"
      }
     ]
    }
   ]
  }
 },
 {
  "key": "nut-don",
  "number": 3,
  "name": "Nút đơn",
  "groups": [
   "Simple",
   "Thuỷ tinh"
  ],
  "about": "Nền vũ trụ lấp lánh, một nút Google tròn lớn chữ chạy vòng quanh, lời cảm ơn nhiều màu.",
  "doc": {
   "v": 1,
   "sections": [
    {
     "id": "a",
     "name": "Khúc A",
     "h": 740,
     "bg": {
      "src": "art:space"
     },
     "els": [
      {
       "id": "bang-ten",
       "t": "shape",
       "shape": "rect",
       "x": 110,
       "y": 30,
       "w": 170,
       "h": 94,
       "radius": 22,
       "fill": {
        "kind": "linear",
        "angle": 180,
        "stops": [
         [
          "#5a2c16",
          0
         ],
         [
          "#3a1a0b",
          100
         ]
        ]
       },
       "shadow": {
        "x": 0,
        "y": 8,
        "blur": 22,
        "color": "#00000099"
       },
       "motion": {
        "in": "drop",
        "at": 100
       }
      },
      {
       "id": "ten-quan",
       "t": "text",
       "x": 112,
       "y": 32,
       "w": 166,
       "h": 62,
       "words": {
        "vi": "Tên Quán"
       },
       "font": "script",
       "size": 42,
       "color": "#f6dcc4",
       "motion": {
        "in": "fade",
        "at": 300
       },
       "slot": "name"
      },
      {
       "id": "nganh",
       "t": "text",
       "x": 112,
       "y": 94,
       "w": 166,
       "h": 18,
       "words": {
        "vi": "PHOTO BOOTH"
       },
       "font": "display",
       "size": 10,
       "color": "#f6dcc4",
       "spacing": 26,
       "motion": {
        "in": "fade",
        "at": 350
       }
      },
      {
       "id": "lap-lanh",
       "t": "shape",
       "shape": "sparkle",
       "x": 250,
       "y": 36,
       "w": 14,
       "h": 14,
       "fill": "#f6dcc4",
       "motion": {
        "loop": "twinkle"
       }
      },
      {
       "id": "the-kinh",
       "t": "shape",
       "shape": "rect",
       "x": 43,
       "y": 139,
       "w": 304,
       "h": 337,
       "radius": 40,
       "glass": {
        "blur": 6,
        "tint": "#ffffff12"
       },
       "edge": {
        "w": 1,
        "color": "#ffffff40"
       },
       "shadow": {
        "x": 0,
        "y": 20,
        "blur": 50,
        "color": "#00000088"
       },
       "motion": {
        "in": "rise",
        "at": 200
       }
      },
      {
       "id": "google",
       "t": "google",
       "look": "ring",
       "ring": "#ffffff",
       "x": 87,
       "y": 166,
       "w": 216,
       "h": 216,
       "motion": {
        "in": "pop",
        "at": 450
       }
      },
      {
       "id": "cam-on",
       "t": "text",
       "x": 50,
       "y": 396,
       "w": 290,
       "h": 66,
       "words": {
        "vi": "CẢM ƠN QUÝ\nKHÁCH ĐÃ GHÉ !",
        "en": "THANK YOU\nFOR STOPPING BY !"
       },
       "font": "rounded",
       "size": 21,
       "color": "#ffffff",
       "weight": 700,
       "spacing": 22,
       "line": 1.45,
       "colors": [
        "#fbbc05",
        "#ea4335",
        "#34a853",
        "#4285f4"
       ],
       "motion": {
        "in": "rise",
        "at": 700
       }
      },
      {
       "id": "sao-1",
       "t": "shape",
       "shape": "sparkle",
       "x": 30,
       "y": 560,
       "w": 12,
       "h": 12,
       "fill": "#cfe0ff",
       "motion": {
        "loop": "twinkle"
       }
      },
      {
       "id": "sao-2",
       "t": "shape",
       "shape": "sparkle",
       "x": 344,
       "y": 300,
       "w": 10,
       "h": 10,
       "fill": "#ffffff",
       "motion": {
        "loop": "twinkle"
       }
      },
      {
       "id": "gop-y",
       "t": "feedback",
       "x": 14,
       "y": 666,
       "w": 60,
       "h": 60,
       "icon": "plane",
       "color": "#229ED9",
       "edge": "#FFFFFF"
      }
     ]
    }
   ]
  }
 },
 {
  "key": "basic-1",
  "number": 4,
  "name": "Basic 1",
  "groups": [
   "Simple"
  ],
  "about": "Ảnh hero bo góc, logo tròn đè mép, tấm trắng gọn: tên quán, lời mời, nút Google đậm, ba nút mạng xã hội.",
  "doc": {
   "v": 1,
   "sections": [
    {
     "id": "a",
     "name": "Khúc A",
     "h": 690,
     "bg": {
      "fill": {
       "kind": "linear",
       "angle": 120,
       "stops": [
        [
         "#6f7b77",
         0
        ],
        [
         "#a9a6ad",
         60
        ],
        [
         "#c5c0c8",
         100
        ]
       ]
      }
     },
     "els": [
      {
       "id": "ngon-ngu",
       "t": "lang",
       "look": "select",
       "color": "#ffffff",
       "x": 43,
       "y": 22,
       "w": 307,
       "h": 34,
       "label": true
      },
      {
       "id": "anh-chinh",
       "t": "image",
       "src": "art:drinks",
       "x": 43,
       "y": 66,
       "w": 307,
       "h": 192,
       "radius": 20,
       "shadow": {
        "x": 0,
        "y": 10,
        "blur": 26,
        "color": "#00000033"
       },
       "motion": {
        "in": "fade",
        "at": 100
       }
      },
      {
       "id": "tam",
       "t": "stack",
       "x": 41,
       "y": 258,
       "w": 311,
       "h": 372,
       "gap": 10,
       "pad": 16,
       "align": "center",
       "panel": {
        "fill": {
         "kind": "linear",
         "angle": 180,
         "stops": [
          [
           "#ffffff",
           0
          ],
          [
           "#f6f6f0",
           100
          ]
         ]
        },
        "radius": 26,
        "shadow": {
         "x": 0,
         "y": -4,
         "blur": 24,
         "color": "#00000026"
        }
       },
       "motion": {
        "in": "rise",
        "at": 200
       },
       "kids": [
        {
         "id": "cho-logo",
         "t": "shape",
         "shape": "rect",
         "h": 26
        },
        {
         "id": "ten-quan",
         "t": "text",
         "h": 40,
         "words": {
          "vi": "Tên Quán"
         },
         "font": "sans",
         "size": 30,
         "color": "#1d2b24",
         "weight": 800,
         "slot": "name"
        },
        {
         "id": "loi-moi",
         "t": "text",
         "h": 20,
         "words": {
          "vi": "Thật tuyệt nếu nhận được đánh giá của bạn trên:",
          "en": "We would love to hear your review on:"
         },
         "font": "sans",
         "size": 12.5,
         "color": "#2a2a2a"
        },
        {
         "id": "google",
         "t": "google",
         "look": "g",
         "h": 50,
         "w": 278,
         "bg": {
          "kind": "linear",
          "angle": 180,
          "stops": [
           [
            "#3d5c50",
            0
           ],
           [
            "#1f3a30",
            100
           ]
          ]
         },
         "fg": "#ffffff"
        },
        {
         "id": "cam-on",
         "t": "text",
         "h": 32,
         "words": {
          "vi": "Chúng tôi sẽ rất cảm kích nếu nhận được đánh giá Google của bạn.",
          "en": "We would really appreciate your Google review."
         },
         "font": "sans",
         "size": 11.5,
         "color": "#6b6f76",
         "line": 1.35
        },
        {
         "id": "hang-nut",
         "t": "row",
         "h": 46,
         "gap": 6,
         "kids": [
          {
           "id": "instagram",
           "t": "button",
           "look": "soft",
           "icon": "instagram",
           "label": {
            "vi": "Instagram"
           },
           "link": "https://www.instagram.com/",
           "w": 89,
           "h": 44,
           "size": 11.5,
           "slot": "instagram"
          },
          {
           "id": "zalo",
           "t": "button",
           "look": "soft",
           "icon": "zalo",
           "label": {
            "vi": "Zalo"
           },
           "link": "https://zalo.me/",
           "w": 89,
           "h": 44,
           "size": 11.5,
           "slot": "zalo"
          },
          {
           "id": "tiktok",
           "t": "button",
           "look": "soft",
           "icon": "tiktok",
           "label": {
            "vi": "TikTok"
           },
           "link": "https://www.tiktok.com/",
           "w": 89,
           "h": 44,
           "size": 11.5,
           "slot": "tiktok"
          }
         ]
        },
        {
         "id": "phap-ly",
         "t": "legal",
         "h": 44,
         "color": "#6b6f76",
         "size": 11
        }
       ]
      },
      {
       "id": "nen-logo",
       "t": "shape",
       "shape": "circle",
       "x": 164,
       "y": 226,
       "w": 64,
       "h": 64,
       "fill": "#1e5b45",
       "edge": {
        "w": 4,
        "color": "#ffffff"
       },
       "shadow": {
        "x": 0,
        "y": 6,
        "blur": 16,
        "color": "#00000040"
       },
       "motion": {
        "in": "pop",
        "at": 400
       }
      },
      {
       "id": "logo",
       "t": "icon",
       "icon": "cup",
       "color": "#ffffff",
       "x": 180,
       "y": 242,
       "w": 32,
       "h": 32,
       "motion": {
        "in": "pop",
        "at": 450
       }
      },
      {
       "id": "gop-y",
       "t": "feedback",
       "x": 14,
       "y": 616,
       "w": 60,
       "h": 60,
       "icon": "plane",
       "color": "#229ED9",
       "edge": "#FFFFFF"
      }
     ]
    }
   ]
  }
 },
 {
  "key": "party",
  "number": 5,
  "name": "Interactive card · Party",
  "groups": [
   "Interactive cards"
  ],
  "about": "Thẻ chính tối kiểu party, các thẻ màu ló sau lưng (1–4 thẻ, mỗi thẻ một mạng xã hội); bấm thẻ thì rút ra, bấm lần nữa mới mở.",
  "doc": {
   "v": 1,
   "sections": [
    {
     "id": "a",
     "name": "Khúc A",
     "h": 690,
     "bg": {
      "fill": "#1d1529"
     },
     "els": [
      {
       "id": "cong-1",
       "t": "shape",
       "shape": "plus",
       "x": 84,
       "y": 76,
       "w": 14,
       "h": 14,
       "fill": "#ff4fa3",
       "motion": {
        "in": "pop",
        "at": 500,
        "loop": "twinkle"
       }
      },
      {
       "id": "cong-2",
       "t": "shape",
       "shape": "plus",
       "x": 206,
       "y": 58,
       "w": 12,
       "h": 12,
       "fill": "#b59cff",
       "motion": {
        "in": "pop",
        "at": 600,
        "loop": "twinkle"
       }
      },
      {
       "id": "cong-3",
       "t": "shape",
       "shape": "plus",
       "x": 72,
       "y": 336,
       "w": 12,
       "h": 12,
       "fill": "#b59cff",
       "motion": {
        "in": "pop",
        "at": 700,
        "loop": "twinkle"
       }
      },
      {
       "id": "cong-4",
       "t": "shape",
       "shape": "plus",
       "x": 84,
       "y": 456,
       "w": 14,
       "h": 14,
       "fill": "#ff4fa3",
       "motion": {
        "in": "pop",
        "at": 800,
        "loop": "twinkle"
       }
      },
      {
       "id": "cong-5",
       "t": "shape",
       "shape": "plus",
       "x": 326,
       "y": 548,
       "w": 13,
       "h": 13,
       "fill": "#b59cff",
       "motion": {
        "in": "pop",
        "at": 900,
        "loop": "twinkle"
       }
      },
      {
       "id": "mui-ten",
       "t": "shape",
       "shape": "arrow",
       "x": 236,
       "y": 540,
       "w": 76,
       "h": 44,
       "fill": "#b59cff",
       "motion": {
        "in": "fade",
        "at": 1000
       }
      },
      {
       "id": "tim",
       "t": "shape",
       "shape": "heart",
       "x": 280,
       "y": 560,
       "w": 50,
       "h": 46,
       "fill": "#b59cff",
       "motion": {
        "in": "pop",
        "at": 1100,
        "loop": "pulse"
       }
      },
      {
       "id": "ngon-ngu",
       "t": "lang",
       "look": "select",
       "color": "#ffffff",
       "x": 43,
       "y": 16,
       "w": 307,
       "h": 32,
       "label": true
      },
      {
       "id": "the-bai",
       "t": "deck",
       "look": "party",
       "x": 84,
       "y": 72,
       "w": 264,
       "h": 330,
       "motion": {
        "in": "pop",
        "at": 150
       },
       "front": {
        "tilt": 2,
        "pad": 0,
        "gap": 8,
        "panel": {
         "fill": {
          "kind": "linear",
          "angle": 180,
          "stops": [
           [
            "#2e2548",
            0
           ],
           [
            "#221b37",
            100
           ]
          ]
         },
         "radius": 24,
         "edge": {
          "w": 1,
          "color": "#ffffff26"
         },
         "shadow": {
          "x": 0,
          "y": 18,
          "blur": 40,
          "color": "#00000088"
         },
         "top": 28
        },
        "kids": [
         {
          "id": "chu-dau",
          "t": "text",
          "w": 56,
          "h": 56,
          "words": {
           "vi": "P"
          },
          "font": "sans",
          "size": 24,
          "color": "#1d1529",
          "weight": 900,
          "disc": {
           "fill": "#ffffff",
           "edge": {
            "w": 5,
            "color": "#1d1529"
           }
          },
          "slot": "initial"
         },
         {
          "id": "ten-quan",
          "t": "text",
          "h": 38,
          "words": {
           "vi": "Party"
          },
          "font": "rounded",
          "size": 28,
          "color": "#ffffff",
          "weight": 900,
          "slot": "name"
         },
         {
          "id": "loi-moi",
          "t": "text",
          "w": 220,
          "h": 32,
          "words": {
           "vi": "Thật tuyệt nếu nhận được đánh giá của bạn trên:",
           "en": "We would love to hear your review on:"
          },
          "font": "sans",
          "size": 11.5,
          "color": "#c3bbd6",
          "line": 1.35
         },
         {
          "id": "google",
          "t": "google",
          "look": "g",
          "h": 50,
          "w": 226,
          "bg": "#ffffff",
          "fg": "#111111"
         },
         {
          "id": "cam-on",
          "t": "text",
          "w": 226,
          "h": 30,
          "words": {
           "vi": "Chúng tôi sẽ rất cảm kích nếu nhận được đánh giá Google của bạn.",
           "en": "We would really appreciate your Google review."
          },
          "font": "sans",
          "size": 10.5,
          "color": "#c3bbd6",
          "line": 1.35
         },
         {
          "id": "phap-ly",
          "t": "legal",
          "h": 46,
          "w": 230,
          "color": "#c3bbd6",
          "size": 10.5
         }
        ]
       },
       "cards": [
        {
         "icon": "instagram",
         "label": {
          "vi": "Instagram"
         },
         "link": "https://www.instagram.com/",
         "fill": {
          "kind": "linear",
          "angle": 160,
          "stops": [
           [
            "#ff6fb7",
            0
           ],
           [
            "#ff3d96",
            100
           ]
          ]
         },
         "slot": "instagram"
        },
        {
         "icon": "tiktok",
         "label": {
          "vi": "TikTok"
         },
         "link": "https://www.tiktok.com/",
         "fill": {
          "kind": "linear",
          "angle": 160,
          "stops": [
           [
            "#8f74ff",
            0
           ],
           [
            "#6a4cf0",
            100
           ]
          ]
         },
         "slot": "tiktok"
        },
        {
         "icon": "zalo",
         "label": {
          "vi": "Zalo"
         },
         "link": "https://zalo.me/",
         "fill": {
          "kind": "linear",
          "angle": 160,
          "stops": [
           [
            "#3fd6c6",
            0
           ],
           [
            "#1fb3a6",
            100
           ]
          ]
         },
         "slot": "zalo"
        }
       ]
      },
      {
       "id": "gop-y",
       "t": "feedback",
       "x": 14,
       "y": 616,
       "w": 60,
       "h": 60,
       "icon": "plane",
       "color": "#229ED9",
       "edge": "#FFFFFF"
      }
     ]
    }
   ]
  }
 },
 {
  "key": "illustrate-nha-khoa",
  "number": 6,
  "name": "Illustrate · Nha khoa",
  "groups": [
   "Only Poster",
   "Simple"
  ],
  "about": "Chữ uốn cong, ảnh trong khung bốn cánh, chữ lớn có bóng, nút Google bóng cứng; sau 3 giây có mũi tên gợi ý kéo xuống xem dịch vụ.",
  "doc": {
   "v": 1,
   "fx": {
    "hint": 3000
   },
   "sections": [
    {
     "id": "a",
     "name": "Khúc A",
     "h": 600,
     "bg": {
      "fill": "#d4e8ef"
     },
     "els": [
      {
       "id": "chu-cong",
       "t": "text",
       "x": 80,
       "y": 40,
       "w": 230,
       "h": 74,
       "words": {
        "vi": "it's time to"
       },
       "font": "serif",
       "size": 30,
       "color": "#1f4e79",
       "weight": 600,
       "arc": 150,
       "motion": {
        "in": "fade",
        "at": 100
       }
      },
      {
       "id": "anh",
       "t": "image",
       "src": "art:smile",
       "mask": "clover",
       "x": 81,
       "y": 99,
       "w": 228,
       "h": 222,
       "motion": {
        "in": "zoom",
        "at": 200
       }
      },
      {
       "id": "rang-trai",
       "t": "icon",
       "icon": "tooth",
       "color": "#94b8d6",
       "x": 48,
       "y": 196,
       "w": 26,
       "h": 30,
       "motion": {
        "in": "pop",
        "at": 500,
        "loop": "bob"
       }
      },
      {
       "id": "rang-phai",
       "t": "icon",
       "icon": "tooth",
       "color": "#94b8d6",
       "x": 316,
       "y": 196,
       "w": 26,
       "h": 30,
       "motion": {
        "in": "pop",
        "at": 550,
        "loop": "bob"
       }
      },
      {
       "id": "chu-lon",
       "t": "text",
       "x": 50,
       "y": 288,
       "w": 290,
       "h": 96,
       "words": {
        "vi": "Smile"
       },
       "font": "serif",
       "size": 78,
       "color": "#1f4e79",
       "weight": 800,
       "shadow": {
        "x": 4,
        "y": 4,
        "blur": 0,
        "color": "#9ec1dd"
       },
       "motion": {
        "in": "rise",
        "at": 400
       }
      },
      {
       "id": "google",
       "t": "google",
       "look": "maps",
       "shadow": "hard",
       "x": 72,
       "y": 398,
       "w": 246,
       "h": 50,
       "motion": {
        "in": "pop",
        "at": 650
       }
      },
      {
       "id": "logo",
       "t": "icon",
       "icon": "clinic",
       "x": 287,
       "y": 462,
       "w": 34,
       "h": 34,
       "motion": {
        "in": "fade",
        "at": 800
       }
      },
      {
       "id": "ten-quan",
       "t": "text",
       "x": 228,
       "y": 498,
       "w": 150,
       "h": 16,
       "words": {
        "vi": "TÊN PHÒNG KHÁM"
       },
       "font": "sans",
       "size": 11.5,
       "color": "#c62f3a",
       "weight": 800,
       "motion": {
        "in": "fade",
        "at": 850
       },
       "slot": "name"
      },
      {
       "id": "khau-hieu",
       "t": "text",
       "x": 228,
       "y": 514,
       "w": 150,
       "h": 14,
       "words": {
        "vi": "Răng tốt · Sức khoẻ tốt",
        "en": "Good teeth · Good health"
       },
       "font": "sans",
       "size": 8.5,
       "color": "#1f9d6b",
       "motion": {
        "in": "fade",
        "at": 900
       }
      },
      {
       "id": "gop-y",
       "t": "feedback",
       "x": 14,
       "y": 526,
       "w": 60,
       "h": 60,
       "icon": "plane",
       "color": "#229ED9",
       "edge": "#FFFFFF"
      }
     ]
    },
    {
     "id": "b",
     "name": "Dịch vụ",
     "h": 560,
     "bg": {
      "fill": "#eaf4f8"
     },
     "els": [
      {
       "id": "tieu-de",
       "t": "text",
       "x": 30,
       "y": 36,
       "w": 330,
       "h": 40,
       "words": {
        "vi": "Dịch vụ của chúng tôi",
        "en": "Our services"
       },
       "font": "serif",
       "size": 26,
       "color": "#1f4e79",
       "weight": 700,
       "motion": {
        "in": "rise"
       }
      },
      {
       "id": "the-0",
       "t": "shape",
       "shape": "rect",
       "x": 30,
       "y": 96,
       "w": 330,
       "h": 78,
       "radius": 18,
       "fill": "#ffffff",
       "shadow": {
        "x": 0,
        "y": 6,
        "blur": 18,
        "color": "#1f4e7922"
       },
       "motion": {
        "in": "rise",
        "at": 100
       }
      },
      {
       "id": "bieu-tuong-0",
       "t": "icon",
       "icon": "tooth",
       "color": "#1f4e79",
       "x": 50,
       "y": 118,
       "w": 32,
       "h": 34,
       "motion": {
        "in": "pop",
        "at": 200
       }
      },
      {
       "id": "ten-dv-0",
       "t": "text",
       "x": 96,
       "y": 106,
       "w": 250,
       "h": 24,
       "words": {
        "vi": "Tẩy trắng răng",
        "en": "Teeth whitening"
       },
       "font": "sans",
       "size": 16,
       "color": "#1f4e79",
       "weight": 700,
       "align": "left",
       "motion": {
        "in": "fade",
        "at": 220
       }
      },
      {
       "id": "mo-ta-0",
       "t": "text",
       "x": 96,
       "y": 132,
       "w": 250,
       "h": 30,
       "words": {
        "vi": "Sáng màu răng an toàn, không ê buốt."
       },
       "font": "sans",
       "size": 12,
       "color": "#4b6b85",
       "align": "left",
       "motion": {
        "in": "fade",
        "at": 260
       }
      },
      {
       "id": "the-1",
       "t": "shape",
       "shape": "rect",
       "x": 30,
       "y": 188,
       "w": 330,
       "h": 78,
       "radius": 18,
       "fill": "#ffffff",
       "shadow": {
        "x": 0,
        "y": 6,
        "blur": 18,
        "color": "#1f4e7922"
       },
       "motion": {
        "in": "rise",
        "at": 220
       }
      },
      {
       "id": "bieu-tuong-1",
       "t": "icon",
       "icon": "clinic",
       "color": "#1f4e79",
       "x": 50,
       "y": 210,
       "w": 32,
       "h": 34,
       "motion": {
        "in": "pop",
        "at": 320
       }
      },
      {
       "id": "ten-dv-1",
       "t": "text",
       "x": 96,
       "y": 198,
       "w": 250,
       "h": 24,
       "words": {
        "vi": "Khám tổng quát",
        "en": "Check-up"
       },
       "font": "sans",
       "size": 16,
       "color": "#1f4e79",
       "weight": 700,
       "align": "left",
       "motion": {
        "in": "fade",
        "at": 340
       }
      },
      {
       "id": "mo-ta-1",
       "t": "text",
       "x": 96,
       "y": 224,
       "w": 250,
       "h": 30,
       "words": {
        "vi": "Kiểm tra, cạo vôi, tư vấn chăm sóc."
       },
       "font": "sans",
       "size": 12,
       "color": "#4b6b85",
       "align": "left",
       "motion": {
        "in": "fade",
        "at": 380
       }
      },
      {
       "id": "the-2",
       "t": "shape",
       "shape": "rect",
       "x": 30,
       "y": 280,
       "w": 330,
       "h": 78,
       "radius": 18,
       "fill": "#ffffff",
       "shadow": {
        "x": 0,
        "y": 6,
        "blur": 18,
        "color": "#1f4e7922"
       },
       "motion": {
        "in": "rise",
        "at": 340
       }
      },
      {
       "id": "bieu-tuong-2",
       "t": "icon",
       "icon": "sparkle",
       "color": "#1f4e79",
       "x": 50,
       "y": 302,
       "w": 32,
       "h": 34,
       "motion": {
        "in": "pop",
        "at": 440
       }
      },
      {
       "id": "ten-dv-2",
       "t": "text",
       "x": 96,
       "y": 290,
       "w": 250,
       "h": 24,
       "words": {
        "vi": "Niềng răng",
        "en": "Braces"
       },
       "font": "sans",
       "size": 16,
       "color": "#1f4e79",
       "weight": 700,
       "align": "left",
       "motion": {
        "in": "fade",
        "at": 460
       }
      },
      {
       "id": "mo-ta-2",
       "t": "text",
       "x": 96,
       "y": 316,
       "w": 250,
       "h": 30,
       "words": {
        "vi": "Mắc cài và khay trong suốt."
       },
       "font": "sans",
       "size": 12,
       "color": "#4b6b85",
       "align": "left",
       "motion": {
        "in": "fade",
        "at": 500
       }
      },
      {
       "id": "dat-lich",
       "t": "button",
       "look": "pill",
       "icon": "calendar",
       "label": {
        "vi": "Đặt lịch khám",
        "en": "Book a visit"
       },
       "link": "https://quitesensational-review-bio.com/",
       "x": 85,
       "y": 392,
       "w": 220,
       "h": 50,
       "size": 16,
       "bg": "#1f4e79",
       "fg": "#ffffff",
       "motion": {
        "in": "pop",
        "at": 500,
        "loop": "pulse"
       },
       "slot": "booking"
      },
      {
       "id": "mxh",
       "t": "stack",
       "x": 95,
       "y": 462,
       "w": 200,
       "h": 40,
       "gap": 0,
       "kids": [
        {
         "id": "hang-mxh",
         "t": "row",
         "h": 40,
         "gap": 18,
         "kids": [
          {
           "id": "ig",
           "t": "icon",
           "icon": "instagram",
           "link": "https://www.instagram.com/",
           "w": 34,
           "h": 34,
           "slot": "instagram"
          },
          {
           "id": "fb",
           "t": "icon",
           "icon": "facebook",
           "link": "https://www.facebook.com/",
           "w": 34,
           "h": 34,
           "slot": "facebook"
          },
          {
           "id": "zl",
           "t": "icon",
           "icon": "zalo",
           "link": "https://zalo.me/",
           "w": 34,
           "h": 34,
           "slot": "zalo"
          },
          {
           "id": "tt",
           "t": "icon",
           "icon": "tiktok",
           "link": "https://www.tiktok.com/",
           "w": 34,
           "h": 34,
           "slot": "tiktok"
          }
         ]
        }
       ]
      }
     ]
    }
   ]
  }
 },
 {
  "key": "khach-san",
  "number": 7,
  "name": "Khách sạn",
  "groups": [
   "Thuỷ tinh",
   "Không gian thực"
  ],
  "about": "Ảnh kiến trúc làm nền, thẻ kính viền trắng, ruy băng xanh, chữ viết tay, nút Google có vạch dọc, hàng link Phòng · Dịch vụ · Đặt phòng.",
  "doc": {
   "v": 1,
   "sections": [
    {
     "id": "a",
     "name": "Khúc A",
     "h": 740,
     "bg": {
      "src": "art:arches"
     },
     "els": [
      {
       "id": "bong",
       "t": "shape",
       "shape": "glow",
       "x": 70,
       "y": 400,
       "w": 250,
       "h": 46,
       "fill": "#000000",
       "o": 0.35,
       "motion": {
        "in": "fade",
        "at": 200
       }
      },
      {
       "id": "the-kinh",
       "t": "shape",
       "shape": "rect",
       "x": 69,
       "y": 89,
       "w": 252,
       "h": 336,
       "radius": 6,
       "glass": {
        "blur": 18,
        "tint": "#2c6ea640"
       },
       "edge": {
        "w": 1.6,
        "color": "#ffffffd0"
       },
       "motion": {
        "in": "fade",
        "at": 150
       }
      },
      {
       "id": "ruy-bang",
       "t": "shape",
       "shape": "ribbon",
       "x": 54,
       "y": 104,
       "w": 86,
       "h": 42,
       "fill": "#1fa0de",
       "motion": {
        "in": "left",
        "at": 350
       }
      },
      {
       "id": "cham",
       "t": "shape",
       "shape": "circle",
       "x": 76,
       "y": 118,
       "w": 14,
       "h": 14,
       "fill": "#ffffff",
       "motion": {
        "in": "pop",
        "at": 450
       }
      },
      {
       "id": "chu-tay",
       "t": "text",
       "x": 140,
       "y": 106,
       "w": 170,
       "h": 72,
       "words": {
        "vi": "Welcome"
       },
       "font": "script",
       "size": 48,
       "color": "#1a8fd0",
       "r": -6,
       "motion": {
        "in": "fade",
        "at": 450
       }
      },
      {
       "id": "ten-quan",
       "t": "text",
       "x": 79,
       "y": 172,
       "w": 232,
       "h": 76,
       "words": {
        "vi": "TÊN KHÁCH\nSẠN",
        "en": "HOTEL\nNAME"
       },
       "font": "display",
       "size": 28,
       "color": "#ffffff",
       "weight": 300,
       "spacing": 4,
       "line": 1.12,
       "shadow": {
        "x": 0,
        "y": 2,
        "blur": 10,
        "color": "#0b2a4a80"
       },
       "motion": {
        "in": "rise",
        "at": 550
       },
       "slot": "name"
      },
      {
       "id": "google",
       "t": "google",
       "look": "maps",
       "bar": "#ffffff",
       "x": 108,
       "y": 258,
       "w": 186,
       "h": 40,
       "shadow": "soft",
       "motion": {
        "in": "pop",
        "at": 700
       }
      },
      {
       "id": "loi-chuc",
       "t": "text",
       "x": 89,
       "y": 320,
       "w": 212,
       "h": 50,
       "words": {
        "vi": "Chúc quý khách một kỳ nghỉ thật trọn vẹn và đáng nhớ.",
        "en": "Wishing you a wonderful, memorable stay."
       },
       "font": "sans",
       "size": 12.5,
       "color": "#ffffff",
       "weight": 600,
       "line": 1.45,
       "shadow": {
        "x": 0,
        "y": 1,
        "blur": 6,
        "color": "#0b2a4a99"
       },
       "motion": {
        "in": "fade",
        "at": 850
       }
      },
      {
       "id": "hang-link",
       "t": "stack",
       "x": 96,
       "y": 392,
       "w": 220,
       "h": 22,
       "gap": 0,
       "kids": [
        {
         "id": "link",
         "t": "row",
         "h": 22,
         "gap": 6,
         "kids": [
          {
           "id": "phong",
           "t": "button",
           "look": "text",
           "label": {
            "vi": "Phòng",
            "en": "Rooms"
           },
           "link": "https://quitesensational-review-bio.com/",
           "w": 46,
           "h": 20,
           "size": 13,
           "fg": "#ffffff",
           "slot": "website"
          },
          {
           "id": "gach-1",
           "t": "text",
           "words": {
            "vi": "|"
           },
           "font": "sans",
           "size": 13,
           "color": "#ffffff",
           "w": 6,
           "h": 20
          },
          {
           "id": "dich-vu",
           "t": "button",
           "look": "text",
           "label": {
            "vi": "Dịch vụ",
            "en": "Services"
           },
           "link": "https://quitesensational-review-bio.com/",
           "w": 56,
           "h": 20,
           "size": 13,
           "fg": "#ffffff",
           "slot": "menu"
          },
          {
           "id": "gach-2",
           "t": "text",
           "words": {
            "vi": "|"
           },
           "font": "sans",
           "size": 13,
           "color": "#ffffff",
           "w": 6,
           "h": 20
          },
          {
           "id": "dat-phong",
           "t": "button",
           "look": "text",
           "label": {
            "vi": "Đặt phòng",
            "en": "Book"
           },
           "link": "https://quitesensational-review-bio.com/",
           "w": 70,
           "h": 20,
           "size": 13,
           "fg": "#ffffff",
           "slot": "booking"
          }
         ]
        }
       ]
      },
      {
       "id": "camera",
       "t": "icon",
       "icon": "camera",
       "color": "#1fa0de",
       "x": 222,
       "y": 528,
       "w": 20,
       "h": 20,
       "link": "https://www.instagram.com/",
       "slot": "instagram"
      },
      {
       "id": "handle",
       "t": "button",
       "look": "text",
       "label": {
        "vi": "@tenkhachsan"
       },
       "link": "https://www.instagram.com/",
       "x": 244,
       "y": 528,
       "w": 120,
       "h": 20,
       "size": 14,
       "fg": "#1fa0de",
       "slot": "handle"
      },
      {
       "id": "gop-y",
       "t": "feedback",
       "x": 14,
       "y": 666,
       "w": 60,
       "h": 60,
       "icon": "plane",
       "color": "#229ED9",
       "edge": "#FFFFFF"
      }
     ]
    }
   ]
  }
 },
 {
  "key": "chuyen-dong",
  "number": 8,
  "name": "Dynamic movement",
  "groups": [
   "Simple",
   "Chuyển động"
  ],
  "about": "Nền teal, các nút hiện lần lượt (Google → Instagram → TikTok → Xem thêm), mỗi nút mới đẩy ảnh phía dưới xuống.",
  "doc": {
   "v": 1,
   "sections": [
    {
     "id": "a",
     "name": "Khúc A",
     "h": 780,
     "bg": {
      "fill": {
       "kind": "linear",
       "angle": 180,
       "stops": [
        [
         "#13807c",
         0
        ],
        [
         "#0c4c4a",
         55
        ],
        [
         "#062a2a",
         100
        ]
       ]
      }
     },
     "els": [
      {
       "id": "vach-trai",
       "t": "shape",
       "shape": "pin-line",
       "x": 46,
       "y": -10,
       "w": 10,
       "h": 286,
       "fill": "#ffffff",
       "motion": {
        "in": "drop",
        "at": 100
       }
      },
      {
       "id": "vach-phai",
       "t": "shape",
       "shape": "pin-line",
       "x": 314,
       "y": 246,
       "w": 10,
       "h": 300,
       "r": 180,
       "fill": "#ffffff",
       "motion": {
        "in": "rise",
        "at": 150
       }
      },
      {
       "id": "rang",
       "t": "icon",
       "icon": "tooth",
       "color": "#ffffff",
       "x": 170,
       "y": 36,
       "w": 50,
       "h": 56,
       "motion": {
        "in": "pop",
        "at": 150
       }
      },
      {
       "id": "ten-quan",
       "t": "text",
       "x": 50,
       "y": 100,
       "w": 290,
       "h": 66,
       "words": {
        "vi": "TÊN PHÒNG\nNHA KHOA",
        "en": "DENTAL\nCLINIC"
       },
       "font": "display",
       "size": 25,
       "color": "#ffffff",
       "weight": 800,
       "spacing": 4,
       "line": 1.12,
       "motion": {
        "in": "rise",
        "at": 250
       },
       "slot": "name"
      },
      {
       "id": "gio",
       "t": "text",
       "x": 100,
       "y": 168,
       "w": 190,
       "h": 16,
       "words": {
        "vi": "Mở cửa 8:00 – 20:00",
        "en": "Open 8:00 – 20:00"
       },
       "font": "display",
       "size": 10,
       "color": "#e3f2f0",
       "spacing": 10,
       "motion": {
        "in": "fade",
        "at": 350
       },
       "slot": "hours"
      },
      {
       "id": "loe-sang",
       "t": "shape",
       "shape": "flare",
       "x": 192,
       "y": 148,
       "w": 56,
       "h": 56,
       "motion": {
        "in": "pop",
        "at": 400,
        "loop": "twinkle"
       }
      },
      {
       "id": "cot",
       "t": "stack",
       "x": 70,
       "y": 222,
       "w": 250,
       "h": 540,
       "gap": 16,
       "align": "center",
       "reveal": 700,
       "kids": [
        {
         "id": "google",
         "t": "google",
         "look": "maps",
         "h": 46,
         "w": 236,
         "shadow": "hard"
        },
        {
         "id": "instagram",
         "t": "button",
         "look": "gradient",
         "icon": "instagram",
         "label": {
          "vi": "instagram"
         },
         "link": "https://www.instagram.com/",
         "h": 42,
         "w": 236,
         "size": 16,
         "bg": {
          "kind": "linear",
          "angle": 90,
          "stops": [
           [
            "#f9ce34",
            0
           ],
           [
            "#ee2a7b",
            50
           ],
           [
            "#c13584",
            75
           ],
           [
            "#6228d7",
            100
           ]
          ]
         },
         "fg": "#ffffff",
         "slot": "instagram"
        },
        {
         "id": "tiktok",
         "t": "button",
         "look": "ring",
         "icon": "tiktok",
         "label": {
          "vi": "TikTok"
         },
         "link": "https://www.tiktok.com/",
         "h": 38,
         "w": 236,
         "size": 16,
         "edge": {
          "w": 3,
          "color": {
           "kind": "linear",
           "angle": 90,
           "stops": [
            [
             "#25f4ee",
             0
            ],
            [
             "#fe2c55",
             100
            ]
           ]
          }
         },
         "slot": "tiktok"
        },
        {
         "id": "xem-them",
         "t": "button",
         "look": "pill",
         "label": {
          "vi": "XEM THÊM",
          "en": "SEE MORE"
         },
         "link": "https://quitesensational-review-bio.com/",
         "h": 58,
         "w": 230,
         "size": 22,
         "weight": 800,
         "bg": "#24597a",
         "fg": "#ffffff",
         "slot": "website"
        },
        {
         "id": "dung-cu",
         "t": "image",
         "src": "art:dental",
         "fit": "contain",
         "h": 260,
         "w": 220
        }
       ]
      },
      {
       "id": "gop-y",
       "t": "feedback",
       "x": 14,
       "y": 706,
       "w": 60,
       "h": 60,
       "icon": "plane",
       "color": "#229ED9",
       "edge": "#FFFFFF"
      }
     ]
    }
   ]
  }
 },
 {
  "key": "nen-ca-phe",
  "number": 9,
  "name": "Nền cà phê đơn giản",
  "groups": [
   "Only Background"
  ],
  "about": "Ảnh ly cà phê toàn khung, chữ uốn cong trên miệng ly, hai ngôi sao xanh, nút Google kính có bàn tay chạm, nút wifi viết tay.",
  "doc": {
   "v": 1,
   "sections": [
    {
     "id": "a",
     "name": "Khúc A",
     "h": 740,
     "bg": {
      "src": "art:latte"
     },
     "els": [
      {
       "id": "chu-cong",
       "t": "text",
       "x": 50,
       "y": 26,
       "w": 290,
       "h": 140,
       "words": {
        "vi": "Life begins after coffee"
       },
       "font": "sans",
       "size": 25,
       "color": "#ffffff",
       "weight": 300,
       "arc": 150,
       "shadow": {
        "x": 0,
        "y": 1,
        "blur": 6,
        "color": "#00000059"
       },
       "motion": {
        "in": "fade",
        "at": 100
       }
      },
      {
       "id": "handle",
       "t": "text",
       "x": 120,
       "y": 60,
       "w": 150,
       "h": 16,
       "words": {
        "vi": "@tenquan"
       },
       "font": "sans",
       "size": 10.5,
       "color": "#ffffff",
       "motion": {
        "in": "fade",
        "at": 300
       },
       "slot": "handle"
      },
      {
       "id": "sao-1",
       "t": "shape",
       "shape": "burst",
       "x": 306,
       "y": -8,
       "w": 88,
       "h": 88,
       "fill": "#3bb08f",
       "motion": {
        "in": "pop",
        "at": 200,
        "loop": "spin"
       }
      },
      {
       "id": "sao-2",
       "t": "shape",
       "shape": "burst",
       "x": -10,
       "y": 146,
       "w": 82,
       "h": 82,
       "fill": "#3bb08f",
       "motion": {
        "in": "pop",
        "at": 300,
        "loop": "spin"
       }
      },
      {
       "id": "google",
       "t": "google",
       "look": "glass",
       "x": 49,
       "y": 356,
       "w": 276,
       "h": 46,
       "motion": {
        "in": "rise",
        "at": 500
       }
      },
      {
       "id": "loi-moi",
       "t": "text",
       "x": 30,
       "y": 420,
       "w": 330,
       "h": 46,
       "words": {
        "vi": "Hãy để lại chút kỷ niệm nơi đây nhé,\nbạn yêu dấu ơi!",
        "en": "Leave a little memory of this place,\ndear friend!"
       },
       "font": "sans",
       "size": 15,
       "color": "#ffffff",
       "weight": 700,
       "line": 1.35,
       "shadow": {
        "x": 0,
        "y": 1,
        "blur": 6,
        "color": "#00000073"
       },
       "motion": {
        "in": "fade",
        "at": 700
       }
      },
      {
       "id": "wifi",
       "t": "button",
       "look": "note",
       "icon": "wifi",
       "label": {
        "vi": "Ấn đây để kết nối wifi",
        "en": "Tap for the wifi"
       },
       "wifi": {
        "name": "Ten-Quan-Wifi",
        "pass": "matkhauwifi"
       },
       "x": 214,
       "y": 486,
       "w": 136,
       "h": 54,
       "r": -7,
       "size": 14,
       "motion": {
        "in": "pop",
        "at": 900,
        "loop": "bob"
       },
       "slot": "wifi"
      },
      {
       "id": "gop-y",
       "t": "feedback",
       "x": 14,
       "y": 666,
       "w": 60,
       "h": 60,
       "icon": "plane",
       "color": "#229ED9",
       "edge": "#FFFFFF"
      }
     ]
    }
   ]
  }
 },
 {
  "key": "hair-styling",
  "number": 10,
  "name": "Hair styling",
  "groups": [
   "Only Background",
   "Trong suốt"
  ],
  "about": "Ảnh đứng yên phía sau, một dải nâu trong mờ chạy dọc làm nền phụ; nút Google vàng đồng, nút mạng xã hội có đuôi, khúc mẹo chăm tóc.",
  "doc": {
   "v": 1,
   "backdrop": {
    "src": "art:hair"
   },
   "band": {
    "x": 79,
    "w": 232,
    "fill": "#6e4e3a9e",
    "blur": 2
   },
   "sections": [
    {
     "id": "a",
     "name": "Khúc A",
     "h": 540,
     "els": [
      {
       "id": "nganh",
       "t": "text",
       "x": 79,
       "y": 40,
       "w": 232,
       "h": 36,
       "words": {
        "vi": "HAIR SALON"
       },
       "font": "display",
       "size": 25,
       "color": "#ffffff",
       "spacing": 6,
       "motion": {
        "in": "fade",
        "at": 100
       }
      },
      {
       "id": "ten-quan",
       "t": "text",
       "x": 79,
       "y": 70,
       "w": 232,
       "h": 60,
       "words": {
        "vi": "Tên Salon"
       },
       "font": "script",
       "size": 40,
       "color": "#ffffff",
       "r": -4,
       "motion": {
        "in": "fade",
        "at": 250
       },
       "slot": "name"
      },
      {
       "id": "google",
       "t": "google",
       "look": "g",
       "x": 88,
       "y": 238,
       "w": 214,
       "h": 46,
       "bg": {
        "kind": "linear",
        "angle": 180,
        "stops": [
         [
          "#f1dda6",
          0
         ],
         [
          "#c9a24f",
          55
         ],
         [
          "#9b7432",
          100
         ]
        ]
       },
       "fg": "#ffffff",
       "motion": {
        "in": "pop",
        "at": 450
       }
      },
      {
       "id": "cam-on",
       "t": "text",
       "x": 88,
       "y": 288,
       "w": 214,
       "h": 28,
       "words": {
        "vi": "Chúng tôi sẽ rất cảm kích nếu nhận được đánh giá Google của bạn.",
        "en": "We would really appreciate your Google review."
       },
       "font": "sans",
       "size": 10.5,
       "color": "#ffffff",
       "line": 1.35,
       "motion": {
        "in": "fade",
        "at": 550
       }
      },
      {
       "id": "mxh",
       "t": "stack",
       "x": 100,
       "y": 322,
       "w": 200,
       "h": 160,
       "gap": 10,
       "align": "start",
       "kids": [
        {
         "id": "instagram",
         "t": "button",
         "look": "tail",
         "icon": "instagram",
         "label": {
          "vi": "instagram"
         },
         "link": "https://www.instagram.com/",
         "h": 28,
         "w": 136,
         "size": 15,
         "slot": "instagram"
        },
        {
         "id": "tiktok",
         "t": "button",
         "look": "tail",
         "icon": "tiktok",
         "label": {
          "vi": "TikTok"
         },
         "link": "https://www.tiktok.com/",
         "h": 28,
         "w": 136,
         "size": 15,
         "slot": "tiktok"
        },
        {
         "id": "facebook",
         "t": "button",
         "look": "tail",
         "icon": "facebook",
         "label": {
          "vi": "FaceBook"
         },
         "link": "https://www.facebook.com/",
         "h": 28,
         "w": 136,
         "size": 15,
         "slot": "facebook"
        },
        {
         "id": "dat-lich",
         "t": "button",
         "look": "link",
         "icon": "globe",
         "label": {
          "vi": "Book lịch lần tới",
          "en": "Book your next visit"
         },
         "link": "https://quitesensational-review-bio.com/",
         "h": 28,
         "w": 190,
         "size": 15,
         "weight": 500,
         "fg": "#1a1a1a",
         "slot": "booking"
        }
       ],
       "motion": {
        "in": "rise",
        "at": 650
       }
      },
      {
       "id": "gach",
       "t": "shape",
       "shape": "line",
       "x": 86,
       "y": 488,
       "w": 218,
       "h": 1.6,
       "fill": "#ffffff"
      },
      {
       "id": "handle",
       "t": "text",
       "x": 79,
       "y": 498,
       "w": 232,
       "h": 20,
       "words": {
        "vi": "@tensalon"
       },
       "font": "sans",
       "size": 14,
       "color": "#ffffff",
       "slot": "handle"
      },
      {
       "id": "gop-y",
       "t": "feedback",
       "x": 14,
       "y": 466,
       "w": 60,
       "h": 60,
       "icon": "plane",
       "color": "#229ED9",
       "edge": "#FFFFFF"
      }
     ]
    },
    {
     "id": "b",
     "name": "Mẹo chăm tóc",
     "h": 560,
     "els": [
      {
       "id": "tips",
       "t": "text",
       "x": 79,
       "y": 24,
       "w": 232,
       "h": 32,
       "words": {
        "vi": "TIPS"
       },
       "font": "display",
       "size": 26,
       "color": "#ffffff",
       "spacing": 4,
       "motion": {
        "in": "fade"
       }
      },
      {
       "id": "tips-2",
       "t": "text",
       "x": 79,
       "y": 56,
       "w": 232,
       "h": 30,
       "words": {
        "vi": "BEAUTY SALON"
       },
       "font": "display",
       "size": 21,
       "color": "#ffffff",
       "spacing": 3,
       "motion": {
        "in": "fade",
        "at": 100
       }
      },
      {
       "id": "tips-3",
       "t": "text",
       "x": 79,
       "y": 82,
       "w": 232,
       "h": 46,
       "words": {
        "vi": "Hairdressing"
       },
       "font": "script",
       "size": 32,
       "color": "#ffffff",
       "r": -4,
       "motion": {
        "in": "fade",
        "at": 200
       }
      },
      {
       "id": "meo-icon-0",
       "t": "icon",
       "icon": "shampoo",
       "color": "#ffffff",
       "x": 177,
       "y": 146,
       "w": 36,
       "h": 38,
       "motion": {
        "in": "pop",
        "at": 300
       }
      },
      {
       "id": "meo-0",
       "t": "text",
       "x": 89,
       "y": 188,
       "w": 212,
       "h": 34,
       "words": {
        "vi": "Chọn dầu gội hợp với\ntóc của bạn",
        "en": "Choose the right shampoo\nfor your hair."
       },
       "font": "sans",
       "size": 12.5,
       "color": "#ffffff",
       "line": 1.3,
       "motion": {
        "in": "fade",
        "at": 350
       }
      },
      {
       "id": "meo-icon-1",
       "t": "icon",
       "icon": "conditioner",
       "color": "#ffffff",
       "x": 177,
       "y": 232,
       "w": 36,
       "h": 38,
       "motion": {
        "in": "pop",
        "at": 420
       }
      },
      {
       "id": "meo-1",
       "t": "text",
       "x": 89,
       "y": 274,
       "w": 212,
       "h": 18,
       "words": {
        "vi": "Dầu xả phù hợp",
        "en": "Perfect hair conditioner"
       },
       "font": "sans",
       "size": 12.5,
       "color": "#ffffff",
       "line": 1.3,
       "motion": {
        "in": "fade",
        "at": 470
       }
      },
      {
       "id": "meo-icon-2",
       "t": "icon",
       "icon": "jar",
       "color": "#ffffff",
       "x": 177,
       "y": 318,
       "w": 36,
       "h": 38,
       "motion": {
        "in": "pop",
        "at": 540
       }
      },
      {
       "id": "meo-2",
       "t": "text",
       "x": 89,
       "y": 360,
       "w": 212,
       "h": 18,
       "words": {
        "vi": "Ủ tóc",
        "en": "Hair mask"
       },
       "font": "sans",
       "size": 12.5,
       "color": "#ffffff",
       "line": 1.3,
       "motion": {
        "in": "fade",
        "at": 590
       }
      },
      {
       "id": "meo-icon-3",
       "t": "icon",
       "icon": "capsule",
       "color": "#ffffff",
       "x": 177,
       "y": 404,
       "w": 36,
       "h": 38,
       "motion": {
        "in": "pop",
        "at": 660
       }
      },
      {
       "id": "meo-3",
       "t": "text",
       "x": 89,
       "y": 446,
       "w": 212,
       "h": 18,
       "words": {
        "vi": "Vitamin cho tóc",
        "en": "Hair vitamin"
       },
       "font": "sans",
       "size": 12.5,
       "color": "#ffffff",
       "line": 1.3,
       "motion": {
        "in": "fade",
        "at": 710
       }
      },
      {
       "id": "handle-2",
       "t": "text",
       "x": 79,
       "y": 500,
       "w": 232,
       "h": 20,
       "words": {
        "vi": "@tensalon"
       },
       "font": "sans",
       "size": 14,
       "color": "#ffffff",
       "slot": "handle"
      },
      {
       "id": "gach-2",
       "t": "shape",
       "shape": "line",
       "x": 86,
       "y": 534,
       "w": 218,
       "h": 1.6,
       "fill": "#ffffff"
      }
     ]
    }
   ]
  }
 },
 {
  "key": "tam-thiep",
  "number": 11,
  "name": "Tấm thiệp",
  "groups": [
   "Simple",
   "Tối giản"
  ],
  "about": "Ảnh quán trong khung vòm, chữ cái đầu trong vòng tròn, tên quán chữ có chân và câu chào viết tay; bốn bảng màu.",
  "knobs": {
   "palettes": [
    {
     "name": "Kem sữa",
     "colors": [
      "#f4ede3",
      "#2b211c",
      "#b5653d",
      "#8a7b70",
      "#fffaf3"
     ]
    },
    {
     "name": "Rêu",
     "colors": [
      "#e8ede2",
      "#1f3329",
      "#5f7f4f",
      "#6c7a6f",
      "#f8fbf4"
     ]
    },
    {
     "name": "Đêm",
     "colors": [
      "#17181d",
      "#f3e9d8",
      "#d4a65a",
      "#9a958c",
      "#23252c"
     ]
    },
    {
     "name": "Hồng đất",
     "colors": [
      "#f5e6e1",
      "#4a2a2a",
      "#c0636f",
      "#94706c",
      "#fff6f3"
     ]
    }
   ],
   "photos": [
    {
     "id": "anh-quan",
     "name": "Ảnh quán (khung vòm)"
    }
   ],
   "texts": [
    {
     "id": "cau-chao",
     "name": "Câu chào"
    }
   ]
  },
  "doc": {
   "v": 1,
   "sections": [
    {
     "id": "a",
     "name": "Khúc A",
     "h": 880,
     "bg": {
      "fill": {
       "kind": "radial",
       "x": 50,
       "y": 22,
       "stops": [
        [
         "#fffaf3",
         0
        ],
        [
         "#f4ede3",
         62
        ]
       ]
      }
     },
     "els": [
      {
       "id": "ngon-ngu",
       "t": "lang",
       "look": "chip",
       "color": "#2b211c",
       "bg": "#fffaf3",
       "x": 286,
       "y": 18,
       "w": 88,
       "h": 30
      },
      {
       "id": "sao-1",
       "t": "shape",
       "shape": "sparkle",
       "x": 62,
       "y": 96,
       "w": 22,
       "h": 22,
       "fill": "#b5653d",
       "motion": {
        "in": "pop",
        "at": 600,
        "loop": "twinkle"
       }
      },
      {
       "id": "sao-2",
       "t": "shape",
       "shape": "sparkle",
       "x": 312,
       "y": 236,
       "w": 16,
       "h": 16,
       "fill": "#b5653d",
       "motion": {
        "in": "pop",
        "at": 750,
        "loop": "twinkle"
       }
      },
      {
       "id": "sao-3",
       "t": "shape",
       "shape": "sparkle",
       "x": 322,
       "y": 84,
       "w": 11,
       "h": 11,
       "fill": "#8a7b70",
       "motion": {
        "in": "pop",
        "at": 900,
        "loop": "twinkle"
       }
      },
      {
       "id": "anh-quan",
       "t": "image",
       "src": "art:latte",
       "x": 80,
       "y": 58,
       "w": 230,
       "h": 292,
       "mask": "arch",
       "edge": {
        "w": 6,
        "color": "#fffaf3"
       },
       "shadow": {
        "x": 0,
        "y": 14,
        "blur": 34,
        "color": "#2b211c33"
       },
       "motion": {
        "in": "rise",
        "at": 80
       },
       "focus": [
        50,
        22
       ]
      },
      {
       "id": "chu-cai",
       "t": "text",
       "x": 167,
       "y": 322,
       "w": 56,
       "h": 56,
       "words": {
        "vi": "T"
       },
       "font": "serif",
       "size": 26,
       "weight": 600,
       "color": "#fffaf3",
       "disc": {
        "fill": "#b5653d",
        "edge": {
         "w": 4,
         "color": "#fffaf3"
        }
       },
       "slot": "initial",
       "motion": {
        "in": "pop",
        "at": 420
       }
      },
      {
       "id": "ten-quan",
       "t": "text",
       "x": 20,
       "y": 390,
       "w": 350,
       "h": 46,
       "words": {
        "vi": "Tên Quán"
       },
       "font": "serif",
       "size": 36,
       "weight": 600,
       "color": "#2b211c",
       "slot": "name",
       "motion": {
        "in": "rise",
        "at": 260
       }
      },
      {
       "id": "cau-chao",
       "t": "text",
       "x": 30,
       "y": 434,
       "w": 330,
       "h": 36,
       "words": {
        "vi": "Ghé một lần, nhớ hoài",
        "en": "Come once, remember always"
       },
       "font": "script",
       "size": 27,
       "color": "#b5653d",
       "motion": {
        "in": "fade",
        "at": 480
       }
      },
      {
       "id": "google",
       "t": "google",
       "look": "g",
       "x": 45,
       "y": 484,
       "w": 300,
       "h": 54,
       "bg": "#2b211c",
       "fg": "#f4ede3",
       "shadow": "soft",
       "motion": {
        "in": "rise",
        "at": 620
       }
      },
      {
       "id": "cam-on",
       "t": "text",
       "x": 22,
       "y": 548,
       "w": 346,
       "h": 34,
       "words": {
        "vi": "Cảm ơn bạn đã ghé — mỗi lời chia sẻ đều quý với quán.",
        "en": "Thank you for stopping by — every word you share means a lot to us."
       },
       "font": "sans",
       "size": 12,
       "color": "#8a7b70",
       "line": 1.4,
       "motion": {
        "in": "fade",
        "at": 760
       }
      },
      {
       "id": "gach",
       "t": "shape",
       "shape": "squiggle",
       "x": 160,
       "y": 592,
       "w": 70,
       "h": 12,
       "fill": "#b5653d",
       "motion": {
        "in": "fade",
        "at": 820
       }
      },
      {
       "id": "duoi",
       "t": "stack",
       "x": 35,
       "y": 620,
       "w": 320,
       "h": 220,
       "gap": 12,
       "align": "center",
       "motion": {
        "in": "rise",
        "at": 860
       },
       "kids": [
        {
         "id": "hang-nut",
         "t": "row",
         "h": 46,
         "gap": 7,
         "kids": [
          {
           "id": "instagram",
           "t": "button",
           "look": "soft",
           "icon": "instagram",
           "label": {
            "vi": "Instagram"
           },
           "link": "https://www.instagram.com/",
           "w": 102,
           "h": 46,
           "size": 12,
           "bg": "#fffaf3",
           "fg": "#2b211c",
           "slot": "instagram"
          },
          {
           "id": "zalo",
           "t": "button",
           "look": "soft",
           "icon": "zalo",
           "label": {
            "vi": "Zalo"
           },
           "link": "https://zalo.me/",
           "w": 102,
           "h": 46,
           "size": 12,
           "bg": "#fffaf3",
           "fg": "#2b211c",
           "slot": "zalo"
          },
          {
           "id": "tiktok",
           "t": "button",
           "look": "soft",
           "icon": "tiktok",
           "label": {
            "vi": "TikTok"
           },
           "link": "https://www.tiktok.com/",
           "w": 102,
           "h": 46,
           "size": 12,
           "bg": "#fffaf3",
           "fg": "#2b211c",
           "slot": "tiktok"
          }
         ]
        },
        {
         "id": "wifi",
         "t": "button",
         "look": "outline",
         "icon": "wifi",
         "label": {
          "vi": "Wifi của quán",
          "en": "Our wifi"
         },
         "wifi": {
          "name": "Ten-Quan-Wifi",
          "pass": "matkhauwifi"
         },
         "w": 200,
         "h": 42,
         "size": 13,
         "bg": "#f4ede3",
         "fg": "#2b211c",
         "edge": {
          "w": 1.5,
          "color": "#b5653d"
         },
         "slot": "wifi"
        },
        {
         "id": "gio-mo",
         "t": "text",
         "h": 18,
         "words": {
          "vi": "Mở cửa 7:00 – 22:00"
         },
         "font": "sans",
         "size": 12.5,
         "weight": 600,
         "color": "#2b211c",
         "slot": "hours"
        },
        {
         "id": "dia-chi",
         "t": "text",
         "h": 34,
         "words": {
          "vi": "12 Đường Hoa Sữa, Quận 1"
         },
         "font": "sans",
         "size": 12,
         "color": "#8a7b70",
         "line": 1.4,
         "slot": "address"
        },
        {
         "id": "phap-ly",
         "t": "legal",
         "h": 40,
         "color": "#8a7b70",
         "size": 11
        }
       ]
      },
      {
       "id": "gop-y",
       "t": "feedback",
       "x": 14,
       "y": 800,
       "w": 60,
       "h": 60,
       "icon": "plane",
       "color": "#229ED9",
       "edge": "#FFFFFF"
      }
     ]
    }
   ]
  }
 }
];
