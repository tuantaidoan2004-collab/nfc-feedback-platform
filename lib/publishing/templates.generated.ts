// Sinh bởi `node scripts/templates.mjs` từ templates/*/ — đừng sửa tay (lát M1).
import type { TemplateManifest } from './template-manifest';

export const TEMPLATE_KEYS = ['standard', 'minimal', 'glass', 'deco', 'spotlight', 'big-button'] as const;
export const TEMPLATE_MANIFESTS: readonly TemplateManifest[] = [
  {
    "key": "standard",
    "number": 1,
    "name": "Bản gốc",
    "pricePerMonth": 10000,
    "page": {
      "background": {
        "kind": "media",
        "media": {
          "kind": "image",
          "url": "/media/stem-background.jpg"
        },
        "loop": true
      }
    },
    "effects": {},
    "versions": [
      {
        "version": 1,
        "date": "2026-09-24",
        "notes": "Thẻ trôi trên ảnh nền, mép trên mờ dần; nền phóng nhẹ và tối dần khi cuộn.",
        "settings": [
          {
            "kind": "background",
            "allow": [
              "solid",
              "gradient",
              "media"
            ]
          },
          {
            "kind": "watermark"
          },
          {
            "kind": "feedbackButton"
          }
        ]
      }
    ]
  },
  {
    "key": "minimal",
    "number": 2,
    "name": "Tối giản",
    "pricePerMonth": 10000,
    "page": {
      "layout": "full-bleed",
      "background": {
        "kind": "solid",
        "color": "#140F22"
      },
      "links": [],
      "watermark": {
        "text": "YOUR LOGO",
        "enabled": false,
        "motion": "diagonal-linear"
      }
    },
    "effects": {},
    "versions": [
      {
        "version": 1,
        "date": "2026-09-24",
        "notes": "Một thẻ tối, quầng tím mờ quanh thẻ, link xếp thành lưới ô.",
        "settings": [
          {
            "kind": "feedbackButton"
          }
        ]
      }
    ]
  },
  {
    "key": "glass",
    "number": 3,
    "name": "Kính",
    "pricePerMonth": 10000,
    "page": {
      "layout": "full-bleed",
      "background": {
        "kind": "gradient",
        "colors": [
          "#1B2B4A",
          "#8FB3D9"
        ],
        "angle": 160
      },
      "links": [],
      "watermark": {
        "text": "YOUR LOGO",
        "enabled": false,
        "motion": "diagonal-linear"
      }
    },
    "effects": {
      "glass": true
    },
    "versions": [
      {
        "version": 1,
        "date": "2026-09-23",
        "notes": "Thân trang và nút link bằng kính khúc xạ trên nền chuyển màu.",
        "settings": [
          {
            "kind": "background",
            "allow": [
              "solid",
              "gradient"
            ]
          },
          {
            "kind": "feedbackButton"
          }
        ]
      }
    ]
  },
  {
    "key": "deco",
    "number": 4,
    "name": "Chồng thẻ",
    "pricePerMonth": 10000,
    "page": {
      "layout": "full-bleed",
      "background": {
        "kind": "solid",
        "color": "#1A1326"
      },
      "links": [],
      "watermark": {
        "text": "YOUR LOGO",
        "enabled": false,
        "motion": "diagonal-linear"
      }
    },
    "effects": {},
    "versions": [
      {
        "version": 1,
        "date": "2026-09-24",
        "notes": "Thẻ nghiêng chồng trên thẻ poster, link xếp hàng dọc.",
        "settings": [
          {
            "kind": "feedbackButton"
          }
        ]
      }
    ]
  },
  {
    "key": "spotlight",
    "number": 5,
    "name": "Ánh sáng tụ",
    "pricePerMonth": 10000,
    "page": {
      "layout": "full-bleed",
      "background": {
        "kind": "solid",
        "color": "#0E0F13"
      },
      "links": [],
      "watermark": {
        "text": "YOUR LOGO",
        "enabled": false,
        "motion": "diagonal-linear"
      }
    },
    "effects": {},
    "versions": [
      {
        "version": 1,
        "date": "2026-09-23",
        "notes": "Nền tối, ánh sáng hổ phách tụ quanh nút Google.",
        "settings": [
          {
            "kind": "feedbackButton"
          }
        ]
      }
    ]
  },
  {
    "key": "big-button",
    "number": 6,
    "name": "Nút lớn",
    "pricePerMonth": 0,
    "page": {
      "layout": "full-bleed",
      "background": {
        "kind": "solid",
        "color": "#F6F3EE"
      },
      "links": [],
      "watermark": {
        "text": "YOUR LOGO",
        "enabled": false,
        "motion": "diagonal-linear"
      }
    },
    "effects": {
      "leaveTransitionMs": 300,
      "googleButton": "orb"
    },
    "versions": [
      {
        "version": 1,
        "date": "2026-09-24",
        "notes": "Nền trắng sữa, một nút Google tròn lớn có chữ chạy vòng quanh.",
        "settings": []
      }
    ]
  }
];
