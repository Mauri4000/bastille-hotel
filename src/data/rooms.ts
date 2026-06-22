import simpleImg from "../assets/rooms/room-simple.jpeg";
import simpleBathImg from "../assets/rooms/room-simple-bath.jpeg";
import simpleSinkImg from "../assets/rooms/room-simple-sink.jpeg";
import simpleDeskImg from "../assets/rooms/room-simple-desk.jpeg";
import simpleClosetImg from "../assets/rooms/room-simple-closet.jpeg";
import doubleImg from "../assets/rooms/room-double.jpeg";
import doubleBathImg from "../assets/rooms/room-double-bath.jpeg";
import doubleSinkImg from "../assets/rooms/room-double-sink.jpeg";
import doubleClosetImg from "../assets/rooms/room-double-closet.jpeg";
import suiteImg from "../assets/rooms/room-suite.jpeg";
import suiteBathImg from "../assets/rooms/room-suite-bath.jpeg";
import suiteSinkImg from "../assets/rooms/room-suite-sink.jpeg";
import suiteMinibarImg from "../assets/rooms/room-suite-minibar.jpeg";
import suiteClosetImg from "../assets/rooms/room-suite-closet.jpeg";
import suiteTripleImg from "../assets/rooms/room-suite-triple.jpeg";
import suiteTripleRoom2Img from "../assets/rooms/room-suite-triple-room2.jpeg";
import suiteTripleBathImg from "../assets/rooms/room-suite-triple-bath.jpeg";
import suiteTripleSinkImg from "../assets/rooms/room-suite-triple-sink.jpeg";
import suiteTripleClosetImg from "../assets/rooms/room-suite-triple-closet.jpeg";

export type RoomCategory = "room" | "suite";
export type AmenityKey =
  | "wifi"
  | "tv"
  | "shower"
  | "desk"
  | "closet"
  | "fan"
  | "breakfast"
  | "hairdryer"
  | "towels"
  | "iron"
  | "laundry"
  | "minibar"
  | "streetview";

export interface Room {
  id: string;
  nameKey: string;
  category: RoomCategory;
  image: string;
  gallery: string[];
  price: number;
  priceUSD: number;
  capacity: number;
  amenities: AmenityKey[];
}

export const rooms: Room[] = [
  {
    id: "simple",
    nameKey: "rooms.names.simple",
    category: "room",
    image: simpleImg,
    gallery: [
      simpleImg,
      simpleBathImg,
      simpleSinkImg,
      simpleDeskImg,
      simpleClosetImg,
    ],
    price: 200,
    priceUSD: 22,
    capacity: 1,
    amenities: [
      "wifi",
      "tv",
      "shower",
      "breakfast",
      "hairdryer",
      "towels",
      "iron",
      "laundry",
      "desk",
      "closet",
      "fan",
    ],
  },
  {
    id: "matrimonial",
    nameKey: "rooms.names.matrimonial",
    category: "room",
    image: simpleImg,
    gallery: [
      simpleImg,
      simpleBathImg,
      simpleSinkImg,
      simpleDeskImg,
      simpleClosetImg,
    ],
    price: 250,
    priceUSD: 27,
    capacity: 2,
    amenities: [
      "wifi",
      "tv",
      "shower",
      "breakfast",
      "hairdryer",
      "towels",
      "iron",
      "laundry",
      "desk",
      "closet",
      "fan",
    ],
  },
  {
    id: "double",
    nameKey: "rooms.names.double",
    category: "room",
    image: doubleImg,
    gallery: [doubleImg, doubleBathImg, doubleSinkImg, doubleClosetImg],
    price: 300,
    priceUSD: 33,
    capacity: 2,
    amenities: [
      "wifi",
      "tv",
      "shower",
      "breakfast",
      "hairdryer",
      "towels",
      "iron",
      "laundry",
      "desk",
      "closet",
      "fan",
    ],
  },
  {
    id: "suite-simple",
    nameKey: "rooms.names.suiteSimple",
    category: "suite",
    image: suiteImg,
    gallery: [
      suiteImg,
      suiteBathImg,
      suiteSinkImg,
      suiteMinibarImg,
      suiteClosetImg,
    ],
    price: 250,
    priceUSD: 27,
    capacity: 1,
    amenities: [
      "wifi",
      "tv",
      "shower",
      "breakfast",
      "hairdryer",
      "towels",
      "iron",
      "laundry",
      "minibar",
      "streetview",
      "desk",
      "closet",
      "fan",
    ],
  },
  {
    id: "suite-matrimonial",
    nameKey: "rooms.names.suiteMatrimonial",
    category: "suite",
    image: suiteImg,
    gallery: [
      suiteImg,
      suiteBathImg,
      suiteSinkImg,
      suiteMinibarImg,
      suiteClosetImg,
    ],
    price: 300,
    priceUSD: 33,
    capacity: 2,
    amenities: [
      "wifi",
      "tv",
      "shower",
      "breakfast",
      "hairdryer",
      "towels",
      "iron",
      "laundry",
      "minibar",
      "streetview",
      "desk",
      "closet",
      "fan",
    ],
  },
  {
    id: "suite-double",
    nameKey: "rooms.names.suiteDouble",
    category: "suite",
    image: suiteImg,
    gallery: [
      suiteImg,
      suiteBathImg,
      suiteSinkImg,
      suiteMinibarImg,
      suiteClosetImg,
    ],
    price: 350,
    priceUSD: 38,
    capacity: 2,
    amenities: [
      "wifi",
      "tv",
      "shower",
      "breakfast",
      "hairdryer",
      "towels",
      "iron",
      "laundry",
      "minibar",
      "streetview",
      "desk",
      "closet",
      "fan",
    ],
  },
  {
    id: "suite-triple",
    nameKey: "rooms.names.suiteTriple",
    category: "suite",
    image: suiteTripleImg,
    gallery: [
      suiteTripleImg,
      suiteTripleRoom2Img,
      suiteTripleBathImg,
      suiteTripleSinkImg,
      suiteTripleClosetImg,
    ],
    price: 400,
    priceUSD: 43,
    capacity: 3,
    amenities: [
      "wifi",
      "tv",
      "shower",
      "breakfast",
      "hairdryer",
      "towels",
      "iron",
      "laundry",
      "minibar",
      "streetview",
      "desk",
      "closet",
      "fan",
    ],
  },
];
